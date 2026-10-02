-- أثر / athar — 004_guest_order_confirmation
-- Returns a confirmation payload (guests cannot SELECT orders under RLS).
-- Locks product rows during validation to reduce oversell races.
-- Keeps server-side price/name snapshots; client still cannot set prices.

drop function if exists public.create_guest_order(text, text, text, text, jsonb);

create or replace function public.create_guest_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
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
begin
  v_name := trim(coalesce(p_customer_name, ''));
  v_phone := trim(coalesce(p_phone, ''));
  v_address := trim(coalesce(p_address, ''));
  v_notes := nullif(trim(coalesce(p_notes, '')), '');

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
    total
  )
  values (
    v_name,
    v_phone,
    v_address,
    v_notes,
    'pending',
    v_subtotal,
    v_subtotal
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
    'customer_name', v_name,
    'subtotal', v_subtotal,
    'total', v_subtotal,
    'items', v_items_out
  );
end;
$$;

revoke all on function public.create_guest_order(text, text, text, text, jsonb) from public;
grant execute on function public.create_guest_order(text, text, text, text, jsonb) to anon, authenticated;
