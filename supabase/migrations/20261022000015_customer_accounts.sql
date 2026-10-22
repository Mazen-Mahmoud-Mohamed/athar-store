-- ============================================================
-- Migration 015: Authenticated customer accounts & order tracking
-- ============================================================
-- Adds customer_id to orders (historical guest rows stay NULL).
-- Replaces create_guest_order with create_customer_order (auth required).
-- Adds customer_cancel_order RPC.
-- Adds RLS policies so customers see only their own orders/items.
-- Never edits earlier migrations.
-- ============================================================
begin;

-- 1. Schema changes ------------------------------------------------

alter table public.profiles
  add column if not exists phone text,
  add column if not exists default_address text;

alter table public.orders
  add column if not exists customer_id uuid references auth.users(id) on delete restrict,
  add column if not exists cancellation_requested_at timestamptz;

create index if not exists orders_customer_created_idx
  on public.orders(customer_id, created_at desc)
  where customer_id is not null;

-- Extend cancellation_source to allow 'customer' value
alter table public.orders drop constraint if exists orders_cancellation_source_check;
alter table public.orders add constraint orders_cancellation_source_check
  check (cancellation_source in ('admin','payment','legacy','customer'));

-- 2. Profile permissions ------------------------------------------
-- Only specific customer-editable fields can be updated via a customer JWT.
revoke insert, update, delete on public.profiles from public, anon, authenticated;
grant update(full_name, phone, default_address) on public.profiles to authenticated;

-- 3. RLS policies --------------------------------------------------
-- Customers see only their own orders
drop policy if exists orders_customer_select on public.orders;
create policy orders_customer_select on public.orders
  for select to authenticated
  using (customer_id = (select auth.uid()));

-- Customers see only items belonging to their own orders
drop policy if exists order_items_customer_select on public.order_items;
create policy order_items_customer_select on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = (select auth.uid())
    )
  );

-- No customer SELECT on payments: token/provider metadata is private.
-- Orders expose the payment_status column which is sufficient for tracking.

-- 4. Drop legacy guest order function (all overloads) -------------
do $remove$ declare f record; begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_guest_order'
  loop
    execute format('drop function %s', f.signature);
  end loop;
end $remove$;

-- 5. create_customer_order -----------------------------------------
create or replace function public.create_customer_order(
  p_customer_name  text,
  p_phone          text,
  p_address        text,
  p_notes          text            default null,
  p_items          jsonb           default '[]'::jsonb,
  p_payment_method public.payment_method default 'cod'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id      uuid;
  v_subtotal      numeric(10,2) := 0;
  v_item          jsonb;
  v_product       public.products%rowtype;
  v_quantity      integer;
  v_line_subtotal numeric(10,2);
  v_items_out     jsonb := '[]'::jsonb;
  v_name          text;
  v_phone         text;
  v_address       text;
  v_notes         text;
  v_product_uuid  uuid;
  v_payment_method public.payment_method;
begin
  -- Auth guard
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
  ) then
    raise exception 'EMAIL_VERIFICATION_REQUIRED' using errcode = '42501';
  end if;

  -- Sanitise inputs
  v_name           := trim(coalesce(p_customer_name, ''));
  v_phone          := trim(coalesce(p_phone, ''));
  v_address        := trim(coalesce(p_address, ''));
  v_notes          := nullif(trim(coalesce(p_notes, '')), '');
  v_payment_method := coalesce(p_payment_method, 'cod'::public.payment_method);

  -- Validate inputs
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ORDER_EMPTY';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'CUSTOMER_NAME_REQUIRED';
  end if;
  if char_length(v_phone) < 8 then
    raise exception 'PHONE_REQUIRED';
  end if;
  if char_length(v_address) < 8 then
    raise exception 'ADDRESS_REQUIRED';
  end if;
  if v_notes is not null and char_length(v_notes) > 500 then
    raise exception 'NOTES_TOO_LONG';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'ORDER_TOO_LARGE';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(x->>'quantity','') !~ '^[1-9][0-9]{0,3}$'
  ) then
    raise exception 'INVALID_QUANTITY';
  end if;

  -- Deduplicate items and lock products in a stable order to prevent deadlocks
  select jsonb_agg(
    jsonb_build_object('product_id', product_id, 'quantity', quantity)
    order by product_id
  )
  into p_items
  from (
    select
      x->>'product_id' as product_id,
      sum((x->>'quantity')::integer) as quantity
    from jsonb_array_elements(p_items) x
    group by x->>'product_id'
  ) grouped;

  -- Lock rows in primary key order to prevent deadlocks
  perform id from public.products
  where id in (
    select (x->>'product_id')::uuid from jsonb_array_elements(p_items) x
  )
  order by id
  for update;

  -- Process each item
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'product_id', '') = '' then
      raise exception 'PRODUCT_ID_REQUIRED';
    end if;

    begin
      v_product_uuid := (v_item->>'product_id')::uuid;
    exception when others then
      raise exception 'PRODUCT_UNAVAILABLE';
    end;

    begin
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'INVALID_QUANTITY';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'INVALID_QUANTITY';
    end if;

    select * into v_product
    from public.products
    where id = v_product_uuid and is_active = true
    for update;

    if not found then
      raise exception 'PRODUCT_UNAVAILABLE';
    end if;

    if v_product.stock_quantity < v_quantity then
      raise exception 'INSUFFICIENT_STOCK';
    end if;

    v_line_subtotal := round(v_product.price * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_subtotal;

    v_items_out := v_items_out || jsonb_build_array(
      jsonb_build_object(
        'product_id',   v_product.id,
        'product_name', v_product.name,
        'unit_price',   v_product.price,
        'quantity',     v_quantity,
        'subtotal',     v_line_subtotal
      )
    );
  end loop;

  -- Insert order
  insert into public.orders (
    customer_id, customer_name, phone, address, notes,
    status, subtotal, total, payment_method, payment_status
  )
  values (
    auth.uid(), v_name, v_phone, v_address, v_notes,
    'pending', v_subtotal, v_subtotal, v_payment_method, 'pending'
  )
  returning id into v_order_id;

  -- Insert order items and deduct stock
  for v_item in select * from jsonb_array_elements(v_items_out)
  loop
    v_quantity      := (v_item->>'quantity')::integer;
    v_product_uuid  := (v_item->>'product_id')::uuid;
    v_line_subtotal := (v_item->>'subtotal')::numeric;

    insert into public.order_items (
      order_id, product_id, product_name, unit_price, quantity, subtotal
    )
    values (
      v_order_id,
      v_product_uuid,
      v_item->>'product_name',
      (v_item->>'unit_price')::numeric,
      v_quantity,
      v_line_subtotal
    );

    update public.products
    set stock_quantity = stock_quantity - v_quantity
    where id = v_product_uuid;
  end loop;

  return jsonb_build_object(
    'id',             v_order_id,
    'status',         'pending',
    'payment_method', v_payment_method,
    'payment_status', 'pending',
    'customer_name',  v_name,
    'subtotal',       v_subtotal,
    'total',          v_subtotal,
    'items',          v_items_out
  );
end;
$$;

revoke all on function public.create_customer_order(text,text,text,text,jsonb,public.payment_method)
  from public, anon, service_role;
grant execute on function public.create_customer_order(text,text,text,text,jsonb,public.payment_method)
  to authenticated;

-- 6. Trigger: reject any direct INSERT that bypasses the RPC -------
drop trigger if exists orders_require_customer on public.orders;
drop function if exists public.enforce_customer_order_identity();

create function public.enforce_customer_order_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.customer_id is distinct from auth.uid() then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
  ) then
    raise exception 'EMAIL_VERIFICATION_REQUIRED' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_customer_order_identity()
  from public, anon, authenticated, service_role;

create trigger orders_require_customer
  before insert on public.orders
  for each row
  execute function public.enforce_customer_order_identity();

-- 7. customer_cancel_order -----------------------------------------
drop function if exists public.customer_cancel_order(uuid);

create function public.customer_cancel_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select * into o
  from public.orders
  where id = p_order_id and customer_id = auth.uid()
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Idempotent: already cancelled by customer
  if o.payment_method = 'cod' and o.status = 'cancelled'
     and o.cancellation_source = 'customer' then
    return o;
  end if;
  -- Idempotent: XPay cancellation already requested
  if o.payment_method = 'xpay' and o.cancellation_requested_at is not null then
    return o;
  end if;

  -- Only pending COD or XPay-pending-cancelled orders are eligible
  if o.status <> 'pending' and not (
    o.payment_method = 'xpay'
    and o.status = 'cancelled'
    and o.cancellation_source = 'payment'
  ) then
    raise exception 'ORDER_NOT_CANCELLABLE' using errcode = '23514';
  end if;

  if o.payment_method = 'xpay' then
    -- Flag for merchant review; do not auto-refund
    update public.orders
    set cancellation_requested_at = now()
    where id = o.id
    returning * into o;
  else
    -- COD: release stock and cancel immediately
    perform public.release_order_stock(o.id);
    update public.orders
    set status = 'cancelled', cancellation_source = 'customer'
    where id = o.id
    returning * into o;
  end if;

  return o;
end;
$$;

revoke all on function public.customer_cancel_order(uuid)
  from public, anon, service_role;
grant execute on function public.customer_cancel_order(uuid)
  to authenticated;

-- 8. enforce_order_status_transition — patch for cancellation_requested_at ----
-- Re-create to respect the new column so that a confirming admin sees the flag.
create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('confirmed','preparing','shipped','delivered')
       and new.cancellation_requested_at is not null then
      raise exception 'CANCELLATION_REVIEW_REQUIRED' using errcode = '23514';
    end if;
    if old.status = 'cancelled' and new.status = 'pending'
       and old.cancellation_source = 'payment'
       and new.customer_id is not null
       and new.payment_status = 'successful'
       and new.cancellation_requested_at is null
       and not new.stock_released then
      return new;
    end if;
    if new.status in ('confirmed','preparing','shipped','delivered')
       and new.payment_method = 'xpay'
       and new.payment_status <> 'successful' then
      raise exception 'XPAY_PAYMENT_REQUIRED' using errcode = 'check_violation';
    end if;
    if old.status = 'cancelled' and new.status = 'confirmed'
       and old.cancellation_source = 'payment'
       and new.payment_method = 'xpay'
       and new.payment_status = 'successful'
       and not new.stock_released then
      return new;
    end if;
    if not public.is_allowed_order_status_transition(old.status, new.status) then
      raise exception 'INVALID_ORDER_STATUS_TRANSITION:%-\u003e%', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- 9. mark_xpay_order_paid — keep customer_id in the pending-stay branch ------
create or replace function public.mark_xpay_order_paid(
  p_payment_id                 uuid,
  p_provider_session_id        text default null,
  p_provider_payment_intent_id text default null,
  p_provider_status            text default null,
  p_provider_payment_status    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment      public.payments%rowtype;
  v_order        public.orders%rowtype;
  v_item         record;
  v_already_paid boolean;
begin
  v_payment := public.lock_xpay_payment(p_payment_id);
  select * into v_order from public.orders where id = v_payment.order_id;
  v_already_paid := v_payment.status = 'successful';

  if v_payment.status in ('refunded','partially_refunded') then
    raise exception 'PAYMENT_ALREADY_REFUNDED';
  end if;

  if not v_already_paid then
    if v_order.payment_status <> v_payment.status then
      raise exception 'XPAY_PAYMENT_STATE_MISMATCH';
    end if;
    if v_order.status not in ('pending','cancelled') then
      raise exception 'INVALID_ORDER_STATUS_TRANSITION';
    end if;

    -- Only a provider-originated cancellation may be revived.
    if v_order.status = 'cancelled'
       and v_order.cancellation_source = 'payment'
       and v_order.cancellation_requested_at is null then
      if not v_order.stock_released then raise exception 'PAYMENT_STOCK_STATE_INVALID'; end if;
      if exists (
        select 1 from public.order_items
        where order_id = v_order.id and product_id is null
      ) then
        raise exception 'PAYMENT_STOCK_UNAVAILABLE';
      end if;
      for v_item in
        select product_id, sum(quantity)::integer as quantity
        from public.order_items
        where order_id = v_order.id
        group by product_id
        order by product_id
      loop
        update public.products
        set stock_quantity = stock_quantity - v_item.quantity
        where id = v_item.product_id and stock_quantity >= v_item.quantity;
        if not found then raise exception 'PAYMENT_STOCK_UNAVAILABLE'; end if;
      end loop;
      update public.orders set stock_released = false where id = v_order.id;
      update public.payments set stock_released = false where order_id = v_order.id;
    end if;

    update public.orders
    set payment_status = 'successful',
        status = case
          -- Customer has requested cancellation: keep at pending so merchant reviews
          when cancellation_requested_at is not null then status
          -- Authenticated customer order: stays pending for merchant to confirm
          when customer_id is not null
               and (status = 'pending' or cancellation_source = 'payment')
            then 'pending'::public.order_status
          -- Legacy guest order (customer_id is null): auto-confirm on payment
          when status = 'pending' or cancellation_source = 'payment'
            then 'confirmed'::public.order_status
          else status
        end
    where id = v_order.id
    returning * into v_order;
  end if;

  update public.payments
  set status                    = 'successful',
      stock_released            = v_order.stock_released,
      provider_session_id       = coalesce(p_provider_session_id, provider_session_id),
      provider_payment_intent_id = coalesce(p_provider_payment_intent_id, provider_payment_intent_id),
      provider_status           = coalesce(p_provider_status, provider_status),
      provider_payment_status   = coalesce(p_provider_payment_status, provider_payment_status)
  where id = v_payment.id;

  return jsonb_build_object(
    'payment_id',     v_payment.id,
    'payment_status', 'successful',
    'order_id',       v_order.id,
    'order_status',   v_order.status,
    'already_paid',   v_already_paid
  );
end;
$$;

notify pgrst, 'reload schema';
commit;
