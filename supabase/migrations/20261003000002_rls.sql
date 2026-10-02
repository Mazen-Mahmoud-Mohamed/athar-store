-- أثر / athar — 002_rls
-- RLS is the security boundary. Admin writes require public.is_admin().

-- ---------------------------------------------------------------------------
-- Secure admin helper (bypasses RLS; fixed search_path; no dynamic SQL)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Guest order creation via SECURITY DEFINER RPC
-- Trusts server-side product prices/names (snapshots), not client amounts.
-- Returns only the new order id — does not expose other customers' orders.
-- ---------------------------------------------------------------------------
create or replace function public.create_guest_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
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
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must include at least one item';
  end if;

  if length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'Customer name is required';
  end if;

  if length(trim(coalesce(p_phone, ''))) = 0 then
    raise exception 'Phone is required';
  end if;

  if length(trim(coalesce(p_address, ''))) = 0 then
    raise exception 'Address is required';
  end if;

  -- Validate items and compute totals from current active catalog prices
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if v_item ->> 'product_id' is null then
      raise exception 'Each item requires product_id';
    end if;

    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Each item requires a positive quantity';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and is_active = true;

    if not found then
      raise exception 'Product unavailable: %', v_item ->> 'product_id';
    end if;

    if v_product.stock_quantity < v_quantity then
      raise exception 'Insufficient stock for product: %', v_product.name;
    end if;

    v_subtotal := v_subtotal + (v_product.price * v_quantity);
  end loop;

  insert into public.orders (
    customer_name,
    phone,
    address,
    notes,
    status,
    subtotal,
    total
  )
  values (
    trim(p_customer_name),
    trim(p_phone),
    trim(p_address),
    nullif(trim(coalesce(p_notes, '')), ''),
    'pending',
    v_subtotal,
    v_subtotal
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and is_active = true;

    v_line_subtotal := v_product.price * v_quantity;

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
      v_product.id,
      v_product.name,
      v_product.price,
      v_quantity,
      v_line_subtotal
    );

    update public.products
    set stock_quantity = stock_quantity - v_quantity
    where id = v_product.id;
  end loop;

  return v_order_id;
end;
$$;

revoke all on function public.create_guest_order(text, text, text, text, jsonb) from public;
grant execute on function public.create_guest_order(text, text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Ensure table privileges exist; RLS still restricts rows/actions
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.products to anon, authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant insert, update, delete on public.categories, public.products to authenticated;
-- Guests do NOT get direct insert on orders/order_items (use create_guest_order RPC)

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_admin_all"
  on public.profiles
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create policy "categories_public_read_active"
  on public.categories
  for select
  to anon, authenticated
  using (is_active = true);

create policy "categories_admin_select"
  on public.categories
  for select
  to authenticated
  using (public.is_admin());

create policy "categories_admin_insert"
  on public.categories
  for insert
  to authenticated
  with check (public.is_admin());

create policy "categories_admin_update"
  on public.categories
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "categories_admin_delete"
  on public.categories
  for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create policy "products_public_read_active"
  on public.products
  for select
  to anon, authenticated
  using (is_active = true);

create policy "products_admin_select"
  on public.products
  for select
  to authenticated
  using (public.is_admin());

create policy "products_admin_insert"
  on public.products
  for insert
  to authenticated
  with check (public.is_admin());

create policy "products_admin_update"
  on public.products
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "products_admin_delete"
  on public.products
  for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- orders
-- No anonymous SELECT / UPDATE / DELETE.
-- Guest creation goes through create_guest_order only.
-- ---------------------------------------------------------------------------
create policy "orders_admin_select"
  on public.orders
  for select
  to authenticated
  using (public.is_admin());

create policy "orders_admin_update"
  on public.orders
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
create policy "order_items_admin_select"
  on public.order_items
  for select
  to authenticated
  using (public.is_admin());
