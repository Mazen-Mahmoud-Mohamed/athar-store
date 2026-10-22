-- Verified-purchase product reviews, manual moderation, private review photos
begin;

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) between 1 and 1200),
  photo_path text,
  status text not null default 'pending' check (status in ('pending','approved','hidden')),
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reviews_product_approved_idx on public.product_reviews(product_id, created_at desc) where status='approved';
create index reviews_pending_idx on public.product_reviews(created_at desc) where status='pending';
create index reviews_customer_idx on public.product_reviews(customer_id, created_at desc);
alter table public.product_reviews enable row level security;
revoke all on public.product_reviews from public, anon, authenticated;
grant select on public.product_reviews to authenticated;
create policy reviews_owner_or_admin_read on public.product_reviews
for select to authenticated
using (customer_id = (select auth.uid()) or (select public.is_admin()));

-- Only this validated RPC can submit a review; no client-side INSERT/UPDATE/DELETE grants.
create function public.submit_product_review(
  p_order_item_id uuid,
  p_rating integer,
  p_comment text default null
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
  v_result public.product_reviews%rowtype;
begin
  if v_customer is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
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
  insert into public.product_reviews (order_item_id,order_id,product_id,customer_id,rating,comment)
  values (p_order_item_id,v_order_id,v_product_id,v_customer,p_rating,v_comment)
  returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.submit_product_review(uuid,integer,text) from public,anon,service_role;
grant execute on function public.submit_product_review(uuid,integer,text) to authenticated;

-- Privileged public API: only published reviews; never exposes customer_id, order_id or order_item_id.
create function public.get_product_reviews(p_product_id uuid)
returns table(review_id uuid,rating smallint,comment text,photo_path text,created_at timestamptz)
language sql stable security definer set search_path=''
as $$
  select r.id,r.rating,r.comment,r.photo_path,r.created_at
  from public.product_reviews r
  where r.product_id=p_product_id and r.status='approved'
  order by r.created_at desc
  limit 60
$$;
revoke all on function public.get_product_reviews(uuid) from public;
grant execute on function public.get_product_reviews(uuid) to anon,authenticated;

create function public.get_product_rating_summary(p_product_id uuid)
returns table(average_rating numeric,review_count bigint)
language sql stable security definer set search_path=''
as $$
  select coalesce(round(avg(r.rating::numeric),1),0),count(*)
  from public.product_reviews r where r.product_id=p_product_id and r.status='approved'
$$;
revoke all on function public.get_product_rating_summary(uuid) from public;
grant execute on function public.get_product_rating_summary(uuid) to anon,authenticated;

-- Private bucket: pending images are never exposed through public storage URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-review-photos','product-review-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

create function public.can_upload_product_review_photo(p_path text)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.product_reviews r
    where r.customer_id=auth.uid() and r.status='pending' and r.photo_path is null
      and p_path in (r.id::text||'/photo.jpg',r.id::text||'/photo.png',r.id::text||'/photo.webp')
  )
$$;
revoke all on function public.can_upload_product_review_photo(text) from public,anon;
grant execute on function public.can_upload_product_review_photo(text) to authenticated;

create function public.can_read_product_review_photo(p_path text)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.product_reviews r
    where r.photo_path=p_path
      and (r.status='approved' or r.customer_id=auth.uid() or public.is_admin())
  )
$$;
revoke all on function public.can_read_product_review_photo(text) from public;
grant execute on function public.can_read_product_review_photo(text) to anon,authenticated;

create policy review_photos_insert on storage.objects for insert to authenticated
with check (
  bucket_id='product-review-photos' and public.can_upload_product_review_photo(name)
);
create policy review_photos_read on storage.objects for select to anon,authenticated
using (
  bucket_id='product-review-photos' and public.can_read_product_review_photo(name)
);
create policy review_photos_admin_delete on storage.objects for delete to authenticated
using (
  bucket_id='product-review-photos' and (select public.is_admin())
);

-- Attach only an already uploaded, correctly named image belonging to this customer.
create function public.attach_product_review_photo(p_review_id uuid,p_path text)
returns void language plpgsql security definer set search_path=''
as $$
declare r public.product_reviews%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select * into r from public.product_reviews where id=p_review_id for update;
  if not found or r.customer_id is distinct from auth.uid() then
    raise exception 'REVIEW_NOT_FOUND' using errcode='42501';
  end if;
  if r.status <> 'pending' or r.photo_path is not null then
    raise exception 'REVIEW_PHOTO_ALREADY_SET' using errcode='23514';
  end if;
  if p_path not in (r.id::text||'/photo.jpg',r.id::text||'/photo.png',r.id::text||'/photo.webp') then
    raise exception 'INVALID_REVIEW_PHOTO' using errcode='23514';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='product-review-photos' and o.name=p_path
  ) then raise exception 'REVIEW_PHOTO_NOT_UPLOADED' using errcode='23514'; end if;
  update public.product_reviews set photo_path=p_path,updated_at=now() where id=p_review_id;
end;
$$;
revoke all on function public.attach_product_review_photo(uuid,text) from public,anon,service_role;
grant execute on function public.attach_product_review_photo(uuid,text) to authenticated;

-- Admin reviews and publishes, hides, or permanently deletes an existing review.
create function public.admin_moderate_product_review(p_review_id uuid,p_action text)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_action not in ('approve','hide','delete') then
    raise exception 'INVALID_MODERATION_ACTION' using errcode='23514';
  end if;
  if not exists (select 1 from public.product_reviews where id=p_review_id) then
    raise exception 'REVIEW_NOT_FOUND' using errcode='P0002';
  end if;
  if p_action='delete' then
    delete from public.product_reviews where id=p_review_id;
  else
    update public.product_reviews
    set status=case when p_action='approve' then 'approved' else 'hidden' end,
        moderated_at=now(),moderated_by=auth.uid(),updated_at=now()
    where id=p_review_id;
  end if;
end;
$$;
revoke all on function public.admin_moderate_product_review(uuid,text) from public,anon,service_role;
grant execute on function public.admin_moderate_product_review(uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
