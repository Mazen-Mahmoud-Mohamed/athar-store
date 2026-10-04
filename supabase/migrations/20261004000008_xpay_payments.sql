-- أثر / athar — 008_xpay_payments
-- XPay Test Mode payment tracking (Hosted Checkout).
-- Does not enable live payments. No card data is stored.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('cod', 'xpay');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum (
      'pending',
      'requires_action',
      'successful',
      'failed',
      'cancelled',
      'refunded',
      'partially_refunded',
      'expired'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Orders: light payment columns (COD remains default)
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists payment_method public.payment_method not null default 'cod';

alter table public.orders
  add column if not exists payment_status public.payment_status not null default 'pending';

create index if not exists orders_payment_method_idx on public.orders (payment_method);
create index if not exists orders_payment_status_idx on public.orders (payment_status);

-- ---------------------------------------------------------------------------
-- payments — authoritative online payment attempts
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null default 'xpay',
  provider_session_id text,
  provider_payment_intent_id text,
  amount numeric(10, 2) not null,
  currency text not null default 'EGP',
  status public.payment_status not null default 'pending',
  provider_status text,
  provider_payment_status text,
  guest_token uuid not null default gen_random_uuid(),
  idempotency_key text,
  -- True after unpaid cancel restored catalog stock. Prevents double-restore;
  -- late paid webhook must re-reserve before confirming.
  stock_released boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_provider_not_blank check (length(trim(provider)) > 0),
  constraint payments_currency_not_blank check (length(trim(currency)) > 0),
  constraint payments_amount_non_negative check (amount >= 0)
);

create unique index if not exists payments_provider_session_id_uidx
  on public.payments (provider_session_id)
  where provider_session_id is not null;

create unique index if not exists payments_idempotency_key_uidx
  on public.payments (idempotency_key)
  where idempotency_key is not null;

create index if not exists payments_order_id_idx on public.payments (order_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_guest_token_idx on public.payments (guest_token);

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Webhook event dedupe (XPay event.id)
-- ---------------------------------------------------------------------------
create table if not exists public.xpay_webhook_events (
  event_id text primary key,
  event_type text not null,
  payment_id uuid references public.payments (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint xpay_webhook_events_event_id_not_blank check (length(trim(event_id)) > 0),
  constraint xpay_webhook_events_event_type_not_blank check (length(trim(event_type)) > 0)
);

create index if not exists xpay_webhook_events_payment_id_idx
  on public.xpay_webhook_events (payment_id);

-- ---------------------------------------------------------------------------
-- RLS — guests must not read arbitrary payment rows
-- ---------------------------------------------------------------------------
alter table public.payments enable row level security;
alter table public.xpay_webhook_events enable row level security;

revoke all on table public.payments from anon, authenticated;
revoke all on table public.xpay_webhook_events from anon, authenticated;

grant select on table public.payments to authenticated;
grant select on table public.xpay_webhook_events to authenticated;

drop policy if exists "payments_admin_select" on public.payments;
create policy "payments_admin_select"
  on public.payments
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "xpay_webhook_events_admin_select" on public.xpay_webhook_events;
create policy "xpay_webhook_events_admin_select"
  on public.xpay_webhook_events
  for select
  to authenticated
  using (public.is_admin());

-- No insert/update/delete policies for anon/authenticated.
-- Edge Functions use the service role (bypasses RLS).

-- ---------------------------------------------------------------------------
-- create_guest_order — optional payment_method (default cod)
-- ---------------------------------------------------------------------------
drop function if exists public.create_guest_order(text, text, text, text, jsonb);

create or replace function public.create_guest_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb,
  p_payment_method public.payment_method default 'cod'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_subtotal numeric(10, 2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_line_subtotal numeric(10, 2);
  v_items_out jsonb := '[]'::jsonb;
  v_name text;
  v_phone text;
  v_address text;
  v_notes text;
  v_product_uuid uuid;
  v_payment_method public.payment_method;
begin
  v_name := trim(coalesce(p_customer_name, ''));
  v_phone := trim(coalesce(p_phone, ''));
  v_address := trim(coalesce(p_address, ''));
  v_notes := nullif(trim(coalesce(p_notes, '')), '');
  v_payment_method := coalesce(p_payment_method, 'cod'::public.payment_method);

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

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item ->> 'product_id', '') = '' then
      raise exception 'PRODUCT_ID_REQUIRED';
    end if;

    begin
      v_product_uuid := (v_item ->> 'product_id')::uuid;
    exception when others then
      raise exception 'PRODUCT_UNAVAILABLE';
    end;

    begin
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'INVALID_QUANTITY';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'INVALID_QUANTITY';
    end if;

    select * into v_product
    from public.products
    where id = v_product_uuid
      and is_active = true
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
        'product_id', v_product.id,
        'product_name', v_product.name,
        'unit_price', v_product.price,
        'quantity', v_quantity,
        'subtotal', v_line_subtotal
      )
    );
  end loop;

  insert into public.orders (
    customer_name,
    phone,
    address,
    notes,
    status,
    subtotal,
    total,
    payment_method,
    payment_status
  )
  values (
    v_name,
    v_phone,
    v_address,
    v_notes,
    'pending',
    v_subtotal,
    v_subtotal,
    v_payment_method,
    'pending'
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(v_items_out)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    v_product_uuid := (v_item ->> 'product_id')::uuid;
    v_line_subtotal := (v_item ->> 'subtotal')::numeric;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      unit_price,
      quantity,
      subtotal
    )
    values (
      v_order_id,
      v_product_uuid,
      v_item ->> 'product_name',
      (v_item ->> 'unit_price')::numeric,
      v_quantity,
      v_line_subtotal
    );

    update public.products
    set stock_quantity = stock_quantity - v_quantity
    where id = v_product_uuid;
  end loop;

  return jsonb_build_object(
    'id', v_order_id,
    'status', 'pending',
    'payment_method', v_payment_method,
    'payment_status', 'pending',
    'customer_name', v_name,
    'subtotal', v_subtotal,
    'total', v_subtotal,
    'items', v_items_out
  );
end;
$$;

revoke all on function public.create_guest_order(text, text, text, text, jsonb, public.payment_method) from public;
grant execute on function public.create_guest_order(text, text, text, text, jsonb, public.payment_method) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Mark XPay order paid (idempotent). Service role / SECURITY DEFINER only.
-- Can revive a previously cancelled unpaid attempt if a late paid event wins,
-- but only by re-reserving stock (never marks paid while leaving stock free).
-- ---------------------------------------------------------------------------
create or replace function public.mark_xpay_order_paid(
  p_payment_id uuid,
  p_provider_session_id text default null,
  p_provider_payment_intent_id text default null,
  p_provider_status text default null,
  p_provider_payment_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_item record;
  v_product public.products%rowtype;
begin
  if p_payment_id is null then
    raise exception 'PAYMENT_ID_REQUIRED';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.provider <> 'xpay' then
    raise exception 'PAYMENT_PROVIDER_MISMATCH';
  end if;

  -- Already successful: idempotent no-op (still refresh provider refs if provided).
  if v_payment.status = 'successful' then
    update public.payments
    set
      provider_session_id = coalesce(p_provider_session_id, provider_session_id),
      provider_payment_intent_id = coalesce(p_provider_payment_intent_id, provider_payment_intent_id),
      provider_status = coalesce(p_provider_status, provider_status),
      provider_payment_status = coalesce(p_provider_payment_status, provider_payment_status)
    where id = v_payment.id
    returning * into v_payment;

    select * into v_order from public.orders where id = v_payment.order_id;
    return jsonb_build_object(
      'payment_id', v_payment.id,
      'payment_status', v_payment.status,
      'order_id', v_order.id,
      'order_status', v_order.status,
      'already_paid', true
    );
  end if;

  if v_payment.status in ('refunded', 'partially_refunded') then
    raise exception 'PAYMENT_ALREADY_REFUNDED';
  end if;

  select * into v_order
  from public.orders
  where id = v_payment.order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.payment_method <> 'xpay' then
    raise exception 'ORDER_NOT_XPAY';
  end if;

  -- If stock was released by an earlier unpaid cancel, re-reserve before confirming.
  if v_payment.stock_released then
    for v_item in
      select product_id, quantity
      from public.order_items
      where order_id = v_order.id
        and product_id is not null
    loop
      select * into v_product
      from public.products
      where id = v_item.product_id
      for update;

      if not found or v_product.stock_quantity < v_item.quantity then
        raise exception 'PAYMENT_STOCK_UNAVAILABLE';
      end if;

      update public.products
      set stock_quantity = stock_quantity - v_item.quantity
      where id = v_item.product_id;
    end loop;
  end if;

  update public.payments
  set
    status = 'successful',
    stock_released = false,
    provider_session_id = coalesce(p_provider_session_id, provider_session_id),
    provider_payment_intent_id = coalesce(p_provider_payment_intent_id, provider_payment_intent_id),
    provider_status = coalesce(p_provider_status, provider_status),
    provider_payment_status = coalesce(p_provider_payment_status, provider_payment_status)
  where id = v_payment.id
  returning * into v_payment;

  update public.orders
  set payment_status = 'successful'
  where id = v_order.id;

  if v_order.status in ('pending'::public.order_status, 'cancelled'::public.order_status) then
    -- pending → confirmed (normal). cancelled → confirmed only after stock re-reserve above.
    update public.orders
    set status = 'confirmed'
    where id = v_order.id
    returning * into v_order;
  else
    select * into v_order from public.orders where id = v_order.id;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'payment_status', v_payment.status,
    'order_id', v_order.id,
    'order_status', v_order.status,
    'already_paid', false
  );
end;
$$;

revoke all on function public.mark_xpay_order_paid(uuid, text, text, text, text) from public;
-- Not granted to anon/authenticated — Edge Functions use service_role.

-- ---------------------------------------------------------------------------
-- Cancel unpaid XPay order + restore stock (failed / cancelled / expired)
-- Never touches successful/refunded payments. Never double-restores stock.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_unpaid_xpay_order(
  p_payment_id uuid,
  p_payment_status public.payment_status,
  p_provider_session_id text default null,
  p_provider_status text default null,
  p_provider_payment_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_item record;
begin
  if p_payment_id is null then
    raise exception 'PAYMENT_ID_REQUIRED';
  end if;

  if p_payment_status not in (
    'failed'::public.payment_status,
    'cancelled'::public.payment_status,
    'expired'::public.payment_status
  ) then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.provider <> 'xpay' then
    raise exception 'PAYMENT_PROVIDER_MISMATCH';
  end if;

  -- Never undo a successful / refunded payment from this path.
  if v_payment.status in (
    'successful'::public.payment_status,
    'refunded'::public.payment_status,
    'partially_refunded'::public.payment_status
  ) then
    select * into v_order from public.orders where id = v_payment.order_id;
    return jsonb_build_object(
      'payment_id', v_payment.id,
      'payment_status', v_payment.status,
      'order_id', v_order.id,
      'order_status', v_order.status,
      'skipped', true
    );
  end if;

  select * into v_order
  from public.orders
  where id = v_payment.order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- If order already progressed past unpaid reservation, do not cancel/restore.
  if v_order.payment_status = 'successful'::public.payment_status
     or v_order.status not in ('pending'::public.order_status, 'cancelled'::public.order_status)
  then
    update public.payments
    set
      provider_session_id = coalesce(p_provider_session_id, provider_session_id),
      provider_status = coalesce(p_provider_status, provider_status),
      provider_payment_status = coalesce(p_provider_payment_status, provider_payment_status)
    where id = v_payment.id
    returning * into v_payment;

    return jsonb_build_object(
      'payment_id', v_payment.id,
      'payment_status', v_payment.status,
      'order_id', v_order.id,
      'order_status', v_order.status,
      'skipped', true
    );
  end if;

  update public.payments
  set
    status = p_payment_status,
    provider_session_id = coalesce(p_provider_session_id, provider_session_id),
    provider_status = coalesce(p_provider_status, provider_status),
    provider_payment_status = coalesce(p_provider_payment_status, provider_payment_status)
  where id = v_payment.id
  returning * into v_payment;

  update public.orders
  set payment_status = p_payment_status
  where id = v_order.id;

  -- Restore stock at most once (stock_released latch).
  if v_order.status = 'pending'
     and v_order.payment_method = 'xpay'
     and not v_payment.stock_released
  then
    for v_item in
      select product_id, quantity
      from public.order_items
      where order_id = v_order.id
        and product_id is not null
    loop
      update public.products
      set stock_quantity = stock_quantity + v_item.quantity
      where id = v_item.product_id;
    end loop;

    update public.payments
    set stock_released = true
    where id = v_payment.id
    returning * into v_payment;

    update public.orders
    set status = 'cancelled'
    where id = v_order.id
    returning * into v_order;
  else
    select * into v_order from public.orders where id = v_order.id;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'payment_status', v_payment.status,
    'order_id', v_order.id,
    'order_status', v_order.status,
    'skipped', false
  );
end;
$$;

revoke all on function public.cancel_unpaid_xpay_order(uuid, public.payment_status, text, text, text) from public;

-- ---------------------------------------------------------------------------
-- Compensate when order was created as xpay but payment/session setup failed
-- before a payments row existed (or payment id known).
-- ---------------------------------------------------------------------------
create or replace function public.cancel_xpay_order_without_payment(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_existing_paid boolean;
begin
  if p_order_id is null then
    raise exception 'ORDER_ID_REQUIRED';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.payment_method <> 'xpay' then
    raise exception 'ORDER_NOT_XPAY';
  end if;

  if v_order.status <> 'pending' or v_order.payment_status = 'successful' then
    return jsonb_build_object(
      'order_id', v_order.id,
      'order_status', v_order.status,
      'skipped', true
    );
  end if;

  select exists (
    select 1
    from public.payments p
    where p.order_id = v_order.id
      and p.status in (
        'successful'::public.payment_status,
        'refunded'::public.payment_status,
        'partially_refunded'::public.payment_status
      )
  ) into v_existing_paid;

  if v_existing_paid then
    return jsonb_build_object(
      'order_id', v_order.id,
      'order_status', v_order.status,
      'skipped', true
    );
  end if;

  for v_item in
    select product_id, quantity
    from public.order_items
    where order_id = v_order.id
      and product_id is not null
  loop
    update public.products
    set stock_quantity = stock_quantity + v_item.quantity
    where id = v_item.product_id;
  end loop;

  update public.orders
  set
    status = 'cancelled',
    payment_status = 'failed'
  where id = v_order.id
  returning * into v_order;

  update public.payments
  set
    status = 'failed',
    stock_released = true
  where order_id = v_order.id
    and status in (
      'pending'::public.payment_status,
      'requires_action'::public.payment_status
    );

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_status', v_order.status,
    'skipped', false
  );
end;
$$;

revoke all on function public.cancel_xpay_order_without_payment(uuid) from public;

-- ---------------------------------------------------------------------------
-- Allow cancelled → confirmed ONLY for XPay orders whose payment is successful.
-- Needed when a late paid webhook arrives after unpaid cancel restored stock.
-- Admin COD cancelled orders still cannot move to confirmed.
-- ---------------------------------------------------------------------------
create or replace function public.is_allowed_order_status_transition(
  p_from public.order_status,
  p_to public.order_status
)
returns boolean
language sql
stable
as $$
  select case
    when p_from = p_to then true
    when p_from in ('delivered'::public.order_status, 'cancelled'::public.order_status) then false
    when p_to = 'cancelled'::public.order_status
      and p_from in (
        'pending'::public.order_status,
        'confirmed'::public.order_status,
        'preparing'::public.order_status,
        'shipped'::public.order_status
      ) then true
    when p_from = 'pending'::public.order_status and p_to = 'confirmed'::public.order_status then true
    when p_from = 'confirmed'::public.order_status and p_to = 'preparing'::public.order_status then true
    when p_from = 'preparing'::public.order_status and p_to = 'shipped'::public.order_status then true
    when p_from = 'shipped'::public.order_status and p_to = 'delivered'::public.order_status then true
    else false
  end;
$$;

create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- XPay paid revival after unpaid cancel (stock already re-reserved in mark_xpay_order_paid).
    if old.status = 'cancelled'::public.order_status
       and new.status = 'confirmed'::public.order_status
       and new.payment_method = 'xpay'::public.payment_method
       and new.payment_status = 'successful'::public.payment_status
    then
      return new;
    end if;

    if not public.is_allowed_order_status_transition(old.status, new.status) then
      raise exception 'INVALID_ORDER_STATUS_TRANSITION:%->%', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
