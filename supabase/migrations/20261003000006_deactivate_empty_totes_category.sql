-- أثر / athar — 006_deactivate_empty_totes_category
-- "شنط توت" is an active empty category (0 products). Deactivate for storefront
-- visibility without deleting the row so it can be re-enabled later.

update public.categories
set is_active = false
where slug = 'totes'
  and is_active = true
  and not exists (
    select 1
    from public.products p
    where p.category_id = categories.id
  );
