-- Refund identity, lifecycle and event acknowledgment share one transaction.
-- Requires 012. Does not correct historical money states or touch stock/status.
begin;

alter table public.xpay_webhook_events
  add column refunds_applied boolean not null default false;

create table public.xpay_refunds (
  provider_refund_id text primary key,
  payment_id uuid not null references public.payments(id),
  provider_payment_intent_id text not null,
  provider_charge_id text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency = 'EGP'),
  status text not null check (status in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')),
  updated_at timestamptz not null default now()
);
create index xpay_refunds_payment_id_idx on public.xpay_refunds(payment_id);
alter table public.xpay_refunds enable row level security;
revoke all on public.xpay_refunds from public, anon, authenticated, service_role;
grant select on public.xpay_refunds to service_role;
create index payments_xpay_intent_idx on public.payments(provider_payment_intent_id)
  where provider = 'xpay';

create function public.apply_xpay_refund_event(
  p_payment_id uuid, p_event_id text, p_event_type text, p_mode text, p_refunds jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_seen public.xpay_webhook_events%rowtype;
  v_refund public.xpay_refunds%rowtype;
  v_row jsonb;
  v_amount bigint;
  v_total bigint;
  v_status text;
  v_next public.payment_status;
begin
  if p_mode is null or p_mode not in ('test', 'live')
     or p_event_id is null or p_event_id !~ ('^evt_' || p_mode || '_[A-Za-z0-9_-]+$')
     or p_event_type is null or p_event_type not in ('refund.created', 'refund.failed', 'charge.refunded')
     or p_refunds is null or jsonb_typeof(p_refunds) <> 'array'
     or jsonb_array_length(p_refunds) = 0 then
    raise exception 'XPAY_REFUND_INVALID';
  end if;
  -- Same order-before-payment locking protocol as 012.
  v_payment := public.lock_xpay_payment(p_payment_id);
  select * into v_order from public.orders where id = v_payment.order_id;
  if v_payment.metadata->>'mode' is distinct from p_mode
     or v_payment.provider_payment_intent_id is null
     or v_payment.provider_payment_intent_id !~ ('^pi_' || p_mode || '_[A-Za-z0-9_-]+$')
     or (select count(*) from public.payments where provider = 'xpay'
         and provider_payment_intent_id = v_payment.provider_payment_intent_id) <> 1
     or v_payment.currency <> 'EGP' or v_payment.amount <> v_order.total then
    raise exception 'XPAY_REFUND_OWNERSHIP_MISMATCH';
  end if;
  if v_payment.status not in ('successful', 'partially_refunded', 'refunded')
     or v_order.payment_status <> v_payment.status then
    -- Refund-before-payment delivery must retry after paid verification.
    raise exception 'XPAY_REFUND_PAYMENT_NOT_PAID';
  end if;
  select * into v_seen from public.xpay_webhook_events where event_id = p_event_id;
  if found then
    if v_seen.event_type <> p_event_type or
       (v_seen.payment_id is not null and v_seen.payment_id <> p_payment_id) then
      raise exception 'XPAY_REFUND_EVENT_CONFLICT';
    end if;
    if v_seen.refunds_applied then
      return jsonb_build_object('duplicate', true);
    end if;
    -- Legacy generic dedupe markers are NOT evidence that refunds were applied.
  end if;
  if p_event_type <> 'charge.refunded' and jsonb_array_length(p_refunds) <> 1 then
    raise exception 'XPAY_REFUND_INVALID';
  end if;
  if (select count(distinct r->>'id') from jsonb_array_elements(p_refunds) r)
      <> jsonb_array_length(p_refunds) then raise exception 'XPAY_REFUND_INVALID'; end if;
  for v_row in select value from jsonb_array_elements(p_refunds) order by value->>'id'
  loop
    if coalesce(v_row->>'id', '') !~ ('^re_' || p_mode || '_[A-Za-z0-9_-]+$')
       or coalesce(v_row->>'charge_id', '') !~ ('^ch_' || p_mode || '_[A-Za-z0-9_-]+$')
       or v_row->>'payment_intent_id' is distinct from v_payment.provider_payment_intent_id
       or v_row->>'currency' is distinct from 'EGP'
       or jsonb_typeof(v_row->'amount_minor') is distinct from 'number'
       or coalesce(v_row->>'amount_minor', '') !~ '^[1-9][0-9]*$'
       or coalesce(v_row->>'status', '') not in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled') then
      raise exception 'XPAY_REFUND_INVALID';
    end if;
    v_amount := (v_row->>'amount_minor')::bigint;
    if v_amount > v_payment.amount * 100 then raise exception 'XPAY_REFUND_AMOUNT_INVALID'; end if;
    v_status := v_row->>'status';
    if p_event_type = 'refund.failed' and v_status <> 'failed' then
      raise exception 'XPAY_REFUND_INVALID';
    end if;
    select * into v_refund from public.xpay_refunds
      where provider_refund_id = v_row->>'id' for update;
    if found then
      if v_refund.payment_id <> p_payment_id or v_refund.amount_minor <> v_amount
         or v_refund.provider_charge_id <> v_row->>'charge_id'
         or v_refund.provider_payment_intent_id <> v_row->>'payment_intent_id' then
        raise exception 'XPAY_REFUND_IDENTITY_CONFLICT';
      end if;
      -- Completed money movements never regress on older lifecycle snapshots.
      -- A later success can supersede failure; stale pending cannot erase failure.
      if v_refund.status = 'succeeded' or
         (v_refund.status in ('failed', 'canceled') and v_status <> 'succeeded') or
         (v_refund.status = 'requires_action' and v_status = 'pending') then
        v_status := v_refund.status;
      end if;
      update public.xpay_refunds set status = v_status, updated_at = now()
        where provider_refund_id = v_row->>'id';
    else
      insert into public.xpay_refunds(provider_refund_id, payment_id,
        provider_payment_intent_id, provider_charge_id, amount_minor, currency, status)
      values (v_row->>'id', p_payment_id, v_row->>'payment_intent_id',
        v_row->>'charge_id', v_amount, 'EGP', v_status);
    end if;
  end loop;
  select coalesce(sum(amount_minor), 0) into v_total from public.xpay_refunds
    where payment_id = p_payment_id and status = 'succeeded';
  if v_total > v_payment.amount * 100 then raise exception 'XPAY_REFUND_AMOUNT_INVALID'; end if;
  -- Preserve historical refund states while their incomplete ledger is reconciled.
  v_next := case when v_payment.status = 'refunded' or v_total = v_payment.amount * 100 then 'refunded'
                 when v_payment.status = 'partially_refunded' or v_total > 0 then 'partially_refunded'
                 else 'successful' end;
  if v_next <> v_payment.status then
    update public.payments set status = v_next where id = p_payment_id;
    update public.orders set payment_status = v_next where id = v_order.id;
  end if;
  -- Insert last, but in the SAME transaction. Any conflict/failure rolls back money states.
  insert into public.xpay_webhook_events(event_id, event_type, payment_id, refunds_applied)
    values (p_event_id, p_event_type, p_payment_id, true)
  on conflict (event_id) do update set payment_id = excluded.payment_id, refunds_applied = true
    where public.xpay_webhook_events.event_type = excluded.event_type
      and (public.xpay_webhook_events.payment_id is null or public.xpay_webhook_events.payment_id = excluded.payment_id)
  returning * into v_seen;
  if not found then raise exception 'XPAY_REFUND_EVENT_CONFLICT'; end if;
  return jsonb_build_object('payment_status', v_next, 'refunded_minor', v_total, 'duplicate', false);
end;
$$;
revoke all on function public.apply_xpay_refund_event(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_xpay_refund_event(uuid, text, text, text, jsonb) to service_role;

commit;
