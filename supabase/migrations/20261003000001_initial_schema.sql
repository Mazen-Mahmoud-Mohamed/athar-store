-- أثر / athar — 001_initial_schema
-- Dedicated schema for the أثر storefront. Do not apply to unrelated projects.

create extension if not exists "pgcrypto";

create type public.user_role as enum ('customer', 'admin');

create type public.order_status as enum (
  'pending',
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- profiles (Auth-linked; never stores passwords)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_slug_unique unique (slug),
  constraint categories_name_not_blank check (length(trim(name)) > 0),
  constraint categories_slug_not_blank check (length(trim(slug)) > 0)
);

-- ---------------------------------------------------------------------------
-- products
-- category_id ON DELETE SET NULL: deleting a category must not destroy products
-- or historical order_items snapshots.
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  price numeric(10, 2) not null,
  old_price numeric(10, 2),
  image_url text,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  is_new boolean not null default false,
  stock_quantity integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_slug_unique unique (slug),
  constraint products_name_not_blank check (length(trim(name)) > 0),
  constraint products_slug_not_blank check (length(trim(slug)) > 0),
  constraint products_price_non_negative check (price >= 0),
  constraint products_old_price_non_negative check (old_price is null or old_price >= 0),
  constraint products_stock_non_negative check (stock_quantity >= 0)
);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  address text not null,
  notes text,
  status public.order_status not null default 'pending',
  subtotal numeric(10, 2) not null,
  total numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_customer_name_not_blank check (length(trim(customer_name)) > 0),
  constraint orders_phone_not_blank check (length(trim(phone)) > 0),
  constraint orders_address_not_blank check (length(trim(address)) > 0),
  constraint orders_subtotal_non_negative check (subtotal >= 0),
  constraint orders_total_non_negative check (total >= 0)
);

-- ---------------------------------------------------------------------------
-- order_items (price/name snapshots — historical integrity)
-- product_id ON DELETE SET NULL keeps line items if a product is removed.
-- ---------------------------------------------------------------------------
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  unit_price numeric(10, 2) not null,
  quantity integer not null,
  subtotal numeric(10, 2) not null,
  constraint order_items_product_name_not_blank check (length(trim(product_name)) > 0),
  constraint order_items_unit_price_non_negative check (unit_price >= 0),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_subtotal_non_negative check (subtotal >= 0)
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup (always customer; admins promoted in DB)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Prevent non-admin role escalation on profiles
-- ---------------------------------------------------------------------------
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is null
       or not exists (
         select 1
         from public.profiles p
         where p.id = auth.uid()
           and p.role = 'admin'
       )
    then
      raise exception 'Changing profile role is not allowed';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_role_escalation();

-- ---------------------------------------------------------------------------
-- Indexes (selective)
-- ---------------------------------------------------------------------------
create index products_category_id_idx on public.products (category_id);
create index products_is_active_idx on public.products (is_active);
create index products_is_featured_idx on public.products (is_featured) where is_featured = true;
create index products_is_new_idx on public.products (is_new) where is_new = true;
create index products_active_created_at_idx on public.products (created_at desc) where is_active = true;

create index categories_is_active_sort_idx on public.categories (is_active, sort_order);

create index orders_status_idx on public.orders (status);
create index orders_created_at_idx on public.orders (created_at desc);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);
