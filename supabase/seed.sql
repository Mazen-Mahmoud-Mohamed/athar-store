-- أثر / athar — optional development/demo seed
-- DO NOT run against production unless intentionally seeding a demo environment.
-- Keep separate from schema migrations.

-- Example categories
insert into public.categories (name, slug, description, is_active, sort_order)
values
  ('حقائب يد', 'handbags', 'قطع أنيقة للمناسبات اليومية والخاصة', true, 1),
  ('حقائب كروس', 'crossbody', 'خفة وأناقة في كل تنقّل', true, 2),
  ('محافظ', 'wallets', 'تفاصيل دقيقة بلمسة فاخرة', true, 3),
  ('إكسسوارات', 'accessories', 'إكمال الإطلالة بأثر لا يُنسى', true, 4)
on conflict (slug) do nothing;

-- Example products (no images — upload via admin Storage later)
insert into public.products (
  category_id,
  name,
  slug,
  description,
  price,
  old_price,
  is_active,
  is_featured,
  is_new,
  stock_quantity
)
select
  c.id,
  v.name,
  v.slug,
  v.description,
  v.price,
  v.old_price,
  true,
  v.is_featured,
  v.is_new,
  v.stock_quantity
from (
  values
    ('handbags', 'حقيبة أثر الكلاسيكية', 'athar-classic-bag', 'تصميم منظم بخطوط ناعمة ولمسة ذهبية رقيقة.', 890.00, 1150.00, true, false, 12),
    ('crossbody', 'كروس حرير المساء', 'silk-evening-crossbody', 'حقيبة كروس خفيفة بملمس ناعم.', 640.00, null, true, true, 8),
    ('handbags', 'حقيبة نوفا المهيكلة', 'nova-structured-bag', 'هيكل متوازن ومقابض مريحة.', 980.00, 1200.00, true, true, 5),
    ('wallets', 'محفظة لونا المزدوجة', 'luna-dual-wallet', 'محفظة عملية بحجم أنيق.', 320.00, 390.00, false, true, 20)
) as v(category_slug, name, slug, description, price, old_price, is_featured, is_new, stock_quantity)
join public.categories c on c.slug = v.category_slug
on conflict (slug) do nothing;

-- Manual admin promotion (run after creating the Auth user in Dashboard):
-- update public.profiles
-- set role = 'admin'
-- where id = '<auth-user-uuid>';
