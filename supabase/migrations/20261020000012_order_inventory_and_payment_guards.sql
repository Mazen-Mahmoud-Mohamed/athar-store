-- One order owns one inventory reservation, irrespective of payment attempts.
-- No historical stock corrections: ambiguous old cancellations need manual review.
begin;

alter table public.orders
  add column stock_released boolean not null default false,
  add column cancellation_source text check (cancellation_source in ('admin', 'payment', 'legacy'));

-- ADD COLUMN holds an exclusive table lock until commit; preserve historical
-- timestamps while backfilling metadata, then restore the normal update trigger.
alter table public.orders disable trigger orders_set_updated_at;
update public.orders o
set stock_released = exists (
      select 1 from public.payments p where p.order_id = o.id and p.stock_released
    ),
    cancellation_source = case when exists (
      select 1 from public.payments p where p.order_id = o.id and p.stock_released
    ) then 'payment' else 'legacy' end
where o.status = 'cancelled';
alter table public.orders enable trigger orders_set_updated_at;

-- RLS alone allowed admins to forge payment state or bypass inventory handling.
revoke update on public.orders from public, anon, authenticated, service_role;
-- Edge handlers may refresh provider references, never financial/stock state.
revoke update on public.payments from service_role;
grant update (provider_session_id, provider_payment_intent_id, provider_status,
  provider_payment_status, metadata, idempotency_key) on public.payments to service_role;
drop policy if exists orders_admin_update on public.orders;

-- Internal helpers: callers cannot invoke these through PostgREST.
-- Every payment state writer takes the order lock BEFORE any payment row lock.
create function public.lock_xpay_payment(p_payment_id uuid)
returns public.payments
language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
begin
  select order_id into v_order_id from public.payments where id = p_payment_id;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  select * into v_order from public.orders where id = v_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_method <> 'xpay' then raise exception 'ORDER_NOT_XPAY'; end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.provider <> 'xpay' or v_payment.order_id <> v_order.id then
    raise exception 'PAYMENT_PROVIDER_MISMATCH';
  end if;
  return v_payment;
end;
$$;
revoke all on function public.lock_xpay_payment(uuid) from public, anon, authenticated, service_role;

create function public.release_order_stock(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  -- Shipped goods require a separate, physical return; never silently restock them.
  if not found or v_order.stock_released
     or v_order.status not in ('pending', 'confirmed', 'preparing') then return; end if;
  for v_item in
    select product_id, sum(quantity)::integer as quantity from public.order_items
    where order_id = p_order_id and product_id is not null
    group by product_id order by product_id
  loop
    update public.products set stock_quantity = stock_quantity + v_item.quantity
    where id = v_item.product_id;
  end loop;
  update public.orders set stock_released = true where id = p_order_id;
  -- Retain the old per-payment marker for compatibility and operational visibility.
  update public.payments set stock_released = true where order_id = p_order_id;
end;
$$;
revoke all on function public.release_order_stock(uuid) from public, anon, authenticated, service_role;

create or replace function public.enforce_order_status_transition()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('confirmed', 'preparing', 'shipped', 'delivered')
       and new.payment_method = 'xpay' and new.payment_status <> 'successful' then
      raise exception 'XPAY_PAYMENT_REQUIRED' using errcode = 'check_violation';
    end if;
    if old.status = 'cancelled' and new.status = 'confirmed'
       and old.cancellation_source = 'payment'
       and new.payment_method = 'xpay' and new.payment_status = 'successful'
       and not new.stock_released then return new; end if;
    if not public.is_allowed_order_status_transition(old.status, new.status) then
      raise exception 'INVALID_ORDER_STATUS_TRANSITION:%->%', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.admin_update_order_status(p_order_id uuid, p_status public.order_status)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_order public.orders%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if p_order_id is null then raise exception 'ORDER_ID_REQUIRED'; end if;
  if p_status is null then raise exception 'ORDER_STATUS_REQUIRED'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status = p_status then
    -- Explicit admin cancellation wins even if an expiry webhook got here first.
    if p_status = 'cancelled' then
      update public.orders set cancellation_source = 'admin' where id = p_order_id
      returning * into v_order;
    end if;
    return v_order;
  end if;
  if not public.is_allowed_order_status_transition(v_order.status, p_status) then
    raise exception 'INVALID_ORDER_STATUS_TRANSITION:%->%', v_order.status, p_status
      using errcode = 'check_violation';
  end if;
  if p_status = 'cancelled' then
    perform public.release_order_stock(p_order_id);
    update public.orders set status = p_status, cancellation_source = 'admin'
    where id = p_order_id returning * into v_order;
  else
    -- The trigger enforces payment status under this same row lock.
    update public.orders set status = p_status where id = p_order_id returning * into v_order;
  end if;
  return v_order;
end;
$$;

create or replace function public.mark_xpay_order_paid(
  p_payment_id uuid, p_provider_session_id text default null,
  p_provider_payment_intent_id text default null, p_provider_status text default null,
  p_provider_payment_status text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_item record;
  v_already_paid boolean;
begin
  v_payment := public.lock_xpay_payment(p_payment_id);
  select * into v_order from public.orders where id = v_payment.order_id;
  v_already_paid := v_payment.status = 'successful';
  if v_payment.status in ('refunded', 'partially_refunded') then
    raise exception 'PAYMENT_ALREADY_REFUNDED';
  end if;
  if not v_already_paid then
    if v_order.payment_status <> v_payment.status then
      raise exception 'XPAY_PAYMENT_STATE_MISMATCH';
    end if;
    if v_order.status not in ('pending', 'cancelled') then
      raise exception 'INVALID_ORDER_STATUS_TRANSITION';
    end if;
    -- Only a provider cancellation may be revived. Admin/ambiguous legacy
    -- cancellations remain cancelled, but the verified payment is still recorded.
    if v_order.status = 'cancelled' and v_order.cancellation_source = 'payment' then
      if not v_order.stock_released then raise exception 'PAYMENT_STOCK_STATE_INVALID'; end if;
      if exists (select 1 from public.order_items where order_id = v_order.id and product_id is null) then
        raise exception 'PAYMENT_STOCK_UNAVAILABLE';
      end if;
      for v_item in
        select product_id, sum(quantity)::integer as quantity from public.order_items
        where order_id = v_order.id group by product_id order by product_id
      loop
        update public.products set stock_quantity = stock_quantity - v_item.quantity
        where id = v_item.product_id and stock_quantity >= v_item.quantity;
        if not found then raise exception 'PAYMENT_STOCK_UNAVAILABLE'; end if;
      end loop;
      update public.orders set stock_released = false where id = v_order.id;
      update public.payments set stock_released = false where order_id = v_order.id;
    end if;
    update public.orders
    set payment_status = 'successful',
        status = case when status = 'pending' or cancellation_source = 'payment'
                      then 'confirmed'::public.order_status else status end
    where id = v_order.id returning * into v_order;
  end if;
  update public.payments
  set status = 'successful', stock_released = v_order.stock_released,
      provider_session_id = coalesce(p_provider_session_id, provider_session_id),
      provider_payment_intent_id = coalesce(p_provider_payment_intent_id, provider_payment_intent_id),
      provider_status = coalesce(p_provider_status, provider_status),
      provider_payment_status = coalesce(p_provider_payment_status, provider_payment_status)
  where id = v_payment.id;
  return jsonb_build_object('payment_id', v_payment.id, 'payment_status', 'successful',
    'order_id', v_order.id, 'order_status', v_order.status, 'already_paid', v_already_paid);
end;
$$;

create or replace function public.cancel_unpaid_xpay_order(
  p_payment_id uuid, p_payment_status public.payment_status,
  p_provider_session_id text default null, p_provider_status text default null,
  p_provider_payment_status text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_skipped boolean;
begin
  if p_payment_status is null or p_payment_status not in ('failed', 'cancelled', 'expired') then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;
  v_payment := public.lock_xpay_payment(p_payment_id);
  select * into v_order from public.orders where id = v_payment.order_id;
  v_skipped := v_payment.status in ('successful', 'refunded', 'partially_refunded')
    or v_order.payment_status in ('successful', 'refunded', 'partially_refunded')
    or v_order.status not in ('pending', 'cancelled')
    or exists (select 1 from public.payments where order_id = v_order.id
               and status in ('successful', 'refunded', 'partially_refunded'));
  if not v_skipped then
    perform public.release_order_stock(v_order.id);
    update public.orders
    set payment_status = p_payment_status, status = 'cancelled',
        cancellation_source = coalesce(cancellation_source, 'payment')
    where id = v_order.id returning * into v_order;
    update public.payments set status = p_payment_status, stock_released = v_order.stock_released
    where id = v_payment.id returning * into v_payment;
  end if;
  update public.payments
  set provider_session_id = coalesce(p_provider_session_id, provider_session_id),
      provider_status = coalesce(p_provider_status, provider_status),
      provider_payment_status = coalesce(p_provider_payment_status, provider_payment_status)
  where id = v_payment.id;
  return jsonb_build_object('payment_id', v_payment.id, 'payment_status', v_payment.status,
    'order_id', v_order.id, 'order_status', v_order.status, 'skipped', v_skipped);
end;
$$;

create or replace function public.cancel_xpay_order_without_payment(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_method <> 'xpay' then raise exception 'ORDER_NOT_XPAY'; end if;
  if v_order.status <> 'pending'
     or v_order.payment_status in ('successful', 'refunded', 'partially_refunded')
     or exists (select 1 from public.payments where order_id = p_order_id
                and status in ('successful', 'refunded', 'partially_refunded')) then
    return jsonb_build_object('order_id', p_order_id, 'order_status', v_order.status, 'skipped', true);
  end if;
  perform public.release_order_stock(p_order_id);
  update public.orders set status = 'cancelled', payment_status = 'failed', cancellation_source = 'payment'
  where id = p_order_id;
  update public.payments set status = 'failed', stock_released = true
  where order_id = p_order_id and status in ('pending', 'requires_action');
  return jsonb_build_object('order_id', p_order_id, 'order_status', 'cancelled', 'skipped', false);
end;
$$;

-- Polling/refunds must not write order and payment status in separate transactions
-- or overwrite a successful payment with a stale requires_action response.
create function public.sync_xpay_payment_status(
  p_payment_id uuid, p_status public.payment_status,
  p_provider_status text default null, p_provider_payment_status text default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
begin
  v_payment := public.lock_xpay_payment(p_payment_id);
  select * into v_order from public.orders where id = v_payment.order_id;
  if p_status = 'requires_action' then
    if v_payment.status <> 'pending' or v_order.payment_status <> 'pending'
       or v_order.status <> 'pending' then return; end if;
  elsif p_status in ('refunded', 'partially_refunded') then
    if v_payment.status not in ('successful', 'partially_refunded')
       or v_order.payment_status not in ('successful', 'partially_refunded') then return; end if;
  else
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;
  update public.payments set status = p_status,
    provider_status = coalesce(p_provider_status, provider_status),
    provider_payment_status = coalesce(p_provider_payment_status, provider_payment_status)
  where id = p_payment_id;
  update public.orders set payment_status = p_status where id = v_order.id;
end;
$$;

revoke all on function public.sync_xpay_payment_status(uuid, public.payment_status, text, text) from public, anon, authenticated;
grant execute on function public.sync_xpay_payment_status(uuid, public.payment_status, text, text) to service_role;
-- CREATE OR REPLACE retains existing grants; state them explicitly for auditability.
revoke all on function public.admin_update_order_status(uuid, public.order_status) from public, anon;
grant execute on function public.admin_update_order_status(uuid, public.order_status) to authenticated;
revoke all on function public.mark_xpay_order_paid(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.cancel_unpaid_xpay_order(uuid, public.payment_status, text, text, text) from public, anon, authenticated;
revoke all on function public.cancel_xpay_order_without_payment(uuid) from public, anon, authenticated;
grant execute on function public.mark_xpay_order_paid(uuid, text, text, text, text) to service_role;
grant execute on function public.cancel_unpaid_xpay_order(uuid, public.payment_status, text, text, text) to service_role;
grant execute on function public.cancel_xpay_order_without_payment(uuid) to service_role;

commit;
