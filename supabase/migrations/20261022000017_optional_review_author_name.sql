-- Optional reviewer name with explicit opt-in and server-controlled profile identity.
begin;

alter table public.product_reviews
  add column show_author_name boolean not null default false,
  add column author_display_name text,
  add constraint review_author_name_opt_in_check
    check (
      (not show_author_name and author_display_name is null)
      or (show_author_name and author_display_name is not null
          and char_length(btrim(author_display_name)) between 1 and 80)
    );

-- Keep the 3-argument RPC intact so older open browser tabs still submit anonymously.
-- The new 4-argument overload requires an explicit opt-in flag.
create function public.submit_product_review(
  p_order_item_id uuid,
  p_rating integer,
  p_comment text,
  p_show_author_name boolean
) returns public.product_reviews
language plpgsql security definer set search_path=''
as $$
declare
  v_customer uuid := auth.uid();
  v_order_id uuid;
  v_owner uuid;
  v_status public.order_status;
  v_product_id uuid;
  v_comment text := nullif(btrim(coalesce(p_comment,'')), '');
  v_display_name text := null;
  v_result public.product_reviews%rowtype;
begin
  if v_customer is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'INVALID_RATING' using errcode='23514';
  end if;
  if char_length(v_comment) > 1200 then
    raise exception 'REVIEW_TOO_LONG' using errcode='23514';
  end if;

  select o.id, o.customer_id, o.status, oi.product_id
    into v_order_id, v_owner, v_status, v_product_id
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id;
  if not found or v_owner is distinct from v_customer then
    raise exception 'ORDER_ITEM_NOT_FOUND' using errcode='42501';
  end if;
  if v_status <> 'delivered' then
    raise exception 'ORDER_NOT_DELIVERED' using errcode='23514';
  end if;
  if v_product_id is null then
    raise exception 'PRODUCT_NOT_AVAILABLE_FOR_REVIEW' using errcode='23514';
  end if;
  if exists (select 1 from public.product_reviews where order_item_id = p_order_item_id) then
    raise exception 'REVIEW_ALREADY_SUBMITTED' using errcode='23505';
  end if;

  if coalesce(p_show_author_name, false) then
    select nullif(left(btrim(p.full_name),80), '')
      into v_display_name
    from public.profiles p
    where p.id = v_customer;
    if v_display_name is null then
      raise exception 'REVIEW_DISPLAY_NAME_MISSING' using errcode='23514';
    end if;
  end if;

  insert into public.product_reviews
    (order_item_id,order_id,product_id,customer_id,rating,comment,show_author_name,author_display_name)
  values
    (p_order_item_id,v_order_id,v_product_id,v_customer,p_rating,v_comment,
     coalesce(p_show_author_name,false),v_display_name)
  returning * into v_result;

  return v_result;
end;
$$;
revoke all on function public.submit_product_review(uuid,integer,text,boolean)
  from public,anon,service_role;
grant execute on function public.submit_product_review(uuid,integer,text,boolean)
  to authenticated;

-- A separate public RPC preserves compatibility with old storefront versions.
-- It exposes an opted-in name only after approval, never profile/customer IDs.
create function public.get_product_reviews_with_names(p_product_id uuid)
returns table(
  review_id uuid,
  rating smallint,
  comment text,
  photo_path text,
  created_at timestamptz,
  display_name text
)
language sql stable security definer set search_path=''
as $$
  select r.id,r.rating,r.comment,r.photo_path,r.created_at,
    case when r.show_author_name then r.author_display_name else null end
  from public.product_reviews r
  where r.product_id=p_product_id and r.status='approved'
  order by r.created_at desc
  limit 60
$$;
revoke all on function public.get_product_reviews_with_names(uuid) from public;
grant execute on function public.get_product_reviews_with_names(uuid) to anon,authenticated;

notify pgrst,'reload schema';
commit;
