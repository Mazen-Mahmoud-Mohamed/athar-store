-- أثر / athar — 007_deactivate_empty_active_categories
-- Migration 006 only deactivated "totes" when ZERO products existed (any status).
-- Production has 1 inactive product under totes, so the category stayed active
-- while the public storefront still shows 0 products.
-- Deactivate "totes" when it has no active products. Do not touch products.

update public.categories
set is_active = false
where slug = 'totes'
  and is_active = true
  and not exists (
    select 1
    from public.products p
    where p.category_id = categories.id
      and p.is_active = true
  );
