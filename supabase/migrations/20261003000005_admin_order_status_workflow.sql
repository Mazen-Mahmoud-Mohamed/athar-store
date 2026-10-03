-- أثر / athar — 005_admin_order_status_workflow
-- Enforce order status transitions server-side (matches UI getAllowedStatusTransitions).
-- Admins must use admin_update_order_status RPC; direct status updates are blocked by trigger.
-- Valid flow: pending -> confirmed -> preparing -> shipped -> delivered
-- Cancel allowed from any non-terminal state (including shipped).
-- delivered and cancelled are final.

create or replace function public.is_allowed_order_status_transition(
  p_from public.order_status,
  p_to public.order_status
)
returns boolean
language sql
immutable
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

revoke all on function public.is_allowed_order_status_transition(public.order_status, public.order_status) from public;
grant execute on function public.is_allowed_order_status_transition(public.order_status, public.order_status) to authenticated;

create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not public.is_allowed_order_status_transition(old.status, new.status) then
      raise exception 'INVALID_ORDER_STATUS_TRANSITION:%->%', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_enforce_status_transition on public.orders;
create trigger orders_enforce_status_transition
  before update of status on public.orders
  for each row
  execute function public.enforce_order_status_transition();

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_status public.order_status
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;

  if p_order_id is null then
    raise exception 'ORDER_ID_REQUIRED';
  end if;

  if p_status is null then
    raise exception 'ORDER_STATUS_REQUIRED';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.status = p_status then
    return v_order;
  end if;

  if not public.is_allowed_order_status_transition(v_order.status, p_status) then
    raise exception 'INVALID_ORDER_STATUS_TRANSITION:%->%', v_order.status, p_status
      using errcode = 'check_violation';
  end if;

  update public.orders
  set status = p_status
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.admin_update_order_status(uuid, public.order_status) from public;
grant execute on function public.admin_update_order_status(uuid, public.order_status) to authenticated;
