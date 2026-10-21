-- Release maintenance is enforced in the database so old clients and direct RPC calls
-- cannot create orders while payment/webhook code is being changed.
begin;

create table public.release_controls (
  singleton boolean primary key default true check (singleton),
  checkout_maintenance boolean not null default false,
  financial_maintenance boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.release_controls(singleton) values (true) on conflict (singleton) do nothing;
alter table public.release_controls enable row level security;
revoke all on public.release_controls from public, anon, authenticated, service_role;

create function public.checkout_maintenance_active()
returns boolean language sql security definer set search_path = '' as $$
  select coalesce((select checkout_maintenance from public.release_controls where singleton), true)
$$;

create function public.set_checkout_maintenance(p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_active is null then raise exception 'MAINTENANCE_STATE_REQUIRED'; end if;
  update public.release_controls set checkout_maintenance = p_active, financial_maintenance = p_active, updated_at = now() where singleton;
end;
$$;
revoke all on function public.set_checkout_maintenance(boolean) from public, anon, authenticated;
grant execute on function public.set_checkout_maintenance(boolean) to service_role;

create function public.resume_xpay_webhook_processing()
returns void language sql security definer set search_path = '' as $$
  update public.release_controls set financial_maintenance=false,updated_at=now() where singleton
$$;
create function public.xpay_webhook_processing_paused()
returns boolean language sql security definer set search_path = '' as $$
  select coalesce((select financial_maintenance from public.release_controls where singleton),true)
$$;
revoke all on function public.resume_xpay_webhook_processing(), public.xpay_webhook_processing_paused() from public, anon, authenticated;
grant execute on function public.resume_xpay_webhook_processing(), public.xpay_webhook_processing_paused() to service_role;

create function public.reject_checkout_during_maintenance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- SHARE locks live until transaction end. Activation waits for existing writers,
  -- and all subsequent writes fail closed until the operator reopens the gate.
  perform 1 from public.release_controls where singleton and not financial_maintenance
    and (not checkout_maintenance or not (tg_table_name in ('orders','payments') and tg_op='INSERT')) for share;
  if not found then
    raise exception 'CHECKOUT_MAINTENANCE' using errcode = 'object_not_in_prerequisite_state';
  end if;
  return null;
end;
$$;
drop trigger if exists orders_reject_checkout_during_maintenance on public.orders;
create trigger orders_reject_checkout_during_maintenance before insert or update or delete on public.orders
for each statement execute function public.reject_checkout_during_maintenance();
create trigger payments_reject_checkout_during_maintenance before insert or update or delete on public.payments
for each statement execute function public.reject_checkout_during_maintenance();
create trigger order_items_reject_checkout_during_maintenance before insert or update or delete on public.order_items
for each statement execute function public.reject_checkout_during_maintenance();
-- Product edits are frozen too, including direct inventory mutation during backup/cutover.
create trigger products_reject_checkout_during_maintenance before insert or update or delete on public.products
for each statement execute function public.reject_checkout_during_maintenance();
revoke all on function public.reject_checkout_during_maintenance() from public, anon, authenticated, service_role;

create table public.xpay_webhook_inbox (
  event_id text primary key,
  event_type text not null,
  mode text not null check (mode in ('test', 'live')),
  payload jsonb not null,
  state text not null default 'received' check (state in ('received', 'processed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz
  ,lease_token uuid
  ,lease_until timestamptz
  ,attempts integer not null default 0
  ,retry_at timestamptz not null default now()
  ,last_error text
);
create index xpay_webhook_inbox_pending_idx on public.xpay_webhook_inbox(received_at,event_id) where state='received';
alter table public.xpay_webhook_inbox enable row level security;
revoke all on public.xpay_webhook_inbox from public, anon, authenticated, service_role;

create function public.queue_xpay_webhook_event(p_event_id text, p_event_type text, p_mode text, p_payload jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v_event public.xpay_webhook_inbox%rowtype;
begin
  if p_event_id is null or btrim(p_event_id) = '' or p_event_type is null or btrim(p_event_type) = ''
     or p_mode is null or p_mode not in ('test', 'live') or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_payload->>'id' is distinct from p_event_id or p_payload->>'type' is distinct from p_event_type then
    raise exception 'XPAY_WEBHOOK_INBOX_INVALID';
  end if;
  insert into public.xpay_webhook_inbox(event_id,event_type,mode,payload)
  values (p_event_id,p_event_type,p_mode,p_payload)
  on conflict (event_id) do nothing;
  select * into strict v_event from public.xpay_webhook_inbox where event_id=p_event_id;
  if v_event.event_type <> p_event_type or v_event.mode <> p_mode or v_event.payload <> p_payload then
    raise exception 'XPAY_WEBHOOK_EVENT_CONFLICT';
  end if;
  return v_event.state;
end;
$$;
-- One live claim globally keeps receipt-order processing deterministic. Failed events
-- back off so a refund delivered before its paid event cannot block that dependency.
create function public.claim_xpay_webhook_event(p_event_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event public.xpay_webhook_inbox%rowtype;
begin
  perform pg_advisory_xact_lock(714014);
  if public.xpay_webhook_processing_paused() then return null; end if;
  if exists(select 1 from public.xpay_webhook_inbox where state='received' and lease_until > clock_timestamp()) then return null; end if;
  select * into v_event from public.xpay_webhook_inbox
  where state='received' and (p_event_id is not null or retry_at <= clock_timestamp())
    and (lease_until is null or lease_until <= clock_timestamp())
    and (p_event_id is null or event_id=p_event_id)
  order by received_at,event_id limit 1 for update;
  if not found then return null; end if;
  update public.xpay_webhook_inbox set lease_token=gen_random_uuid(),
    lease_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1
    where event_id=v_event.event_id returning * into v_event;
  return jsonb_build_object('event_id',v_event.event_id,'payload',v_event.payload,
    'mode',v_event.mode,'lease_token',v_event.lease_token);
end;
$$;
create function public.mark_xpay_webhook_event_processed(p_event_id text, p_lease_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.xpay_webhook_inbox set state='processed', processed_at=now()
    ,lease_token=null,lease_until=null,last_error=null
    where event_id=p_event_id and state='received' and lease_token=p_lease_token;
  if not found then raise exception 'XPAY_WEBHOOK_LEASE_LOST'; end if;
end;
$$;
create function public.retry_xpay_webhook_event(p_event_id text,p_lease_token uuid,p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.xpay_webhook_inbox set lease_token=null,lease_until=null,
    retry_at=clock_timestamp()+interval '30 seconds',
    last_error=left(regexp_replace(coalesce(p_error,'processing_failed'),'[^a-zA-Z0-9_:.-]','_','g'),80)
  where event_id=p_event_id and state='received' and lease_token=p_lease_token;
  if not found then raise exception 'XPAY_WEBHOOK_LEASE_LOST'; end if;
end;
$$;
revoke all on function public.queue_xpay_webhook_event(text,text,text,jsonb), public.claim_xpay_webhook_event(text), public.mark_xpay_webhook_event_processed(text,uuid), public.retry_xpay_webhook_event(text,uuid,text), public.checkout_maintenance_active() from public, anon, authenticated;
grant execute on function public.queue_xpay_webhook_event(text,text,text,jsonb), public.claim_xpay_webhook_event(text), public.mark_xpay_webhook_event_processed(text,uuid), public.retry_xpay_webhook_event(text,uuid,text), public.checkout_maintenance_active() to service_role;

create function public.xpay_webhook_queue_status()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('pending',count(*) filter(where state='received'),
    'processed',count(*) filter(where state='processed'),
    'oldest_pending',min(received_at) filter(where state='received'),
    'maintenance',public.checkout_maintenance_active(),
    'processing_paused',public.xpay_webhook_processing_paused()) from public.xpay_webhook_inbox
$$;
revoke all on function public.xpay_webhook_queue_status() from public, anon, authenticated;
grant execute on function public.xpay_webhook_queue_status() to service_role;
commit;
