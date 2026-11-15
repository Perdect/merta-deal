-- ============================================================================
-- MERTA DEAL — The shop front is four top-level categories.
--   1. Grocery & Kitchen   2. Snacks & Drinks   3. Sweets & Bakery   4. Beauty & Personal Care
--
-- Categories are data, so this is a data change: no view, function or policy is touched. Nothing is
-- deleted — every category row survives, so order history, reports and `products.category_id`
-- (on delete restrict) stay intact. Lines that are no longer top-level become sub-categories of one
-- of the four, or are switched off in place and can be switched back on from Admin → Categories.
--
-- Two rules this file keeps to:
--   * Two levels only. Admin → Categories edits a parent-and-children tree, and its editor refuses to
--     file a category that has sub-categories of its own under a parent. So a line that moves in
--     brings its leaves up beside it rather than making a third level the panel could not show.
--   * A sub-category is switched on if it already was, or if it has a product listed in it. Nothing
--     here invents stock or hides a shelf that has goods on it, on this database or any other.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The four lines. Slugs are untouched where they exist, so every link already out there
--    (/c/grocery, /c/sweets, printed QR short links, service-page chips) still lands.
-- ----------------------------------------------------------------------------
-- The guard matters on a brand-new database: the catalogue is loaded after the migrations, so while
-- the table is still empty this file leaves it alone and lets the catalogue arrive as it is.
insert into public.categories (name, slug, description, icon, color, image_url, sort_order, is_active, is_featured)
select v.name, v.slug, v.description, v.icon, v.color, v.image_url, v.sort_order, true, true
from (values
  ('Grocery & Kitchen', 'grocery', 'Atta, rice, dal, oil, masala, tea and daily kitchen staples', 'wheat', '#E8F3EC', null::text, 1),
  -- The picture is a photograph of stock the shop carries (Bisleri, Frooti).
  ('Snacks & Drinks', 'snacks', 'Cold drinks, juice, water and chocolates', 'cup-soda', '#EFF4FB', '/categories/beverages-collage.webp', 2),
  ('Sweets & Bakery', 'sweets', 'Mithai from Merta''s halwais, plus cakes and bakery items', 'candy', '#FFF1E6', '/categories/sweets-collage.webp', 3),
  ('Beauty & Personal Care', 'personal-care', 'Bath, body, hair and oral care', 'sparkles', '#F4EFFA', null, 4)
) as v(name, slug, description, icon, color, image_url, sort_order)
where exists (select 1 from public.categories)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description, icon = excluded.icon, color = excluded.color,
  image_url = coalesce(excluded.image_url, categories.image_url),
  parent_id = null, sort_order = excluded.sort_order, is_active = true, is_featured = true;

-- Sweets & Bakery needs a shelf for mithai: the Categories screen reaches a parent's goods through its
-- sub-category tiles, so sweets left sitting on the parent itself would have no tile to be found by.
insert into public.categories (parent_id, name, slug, description, icon, color, sort_order, is_active)
select s.id, 'Mithai', 'mithai', 'Kaju katli, rasgulla and halwai sweets', 'candy', '#FFF1E6', 1, true
from public.categories s where s.slug = 'sweets'
on conflict (slug) do update set parent_id = excluded.parent_id, sort_order = 1, is_active = true;

-- ----------------------------------------------------------------------------
-- 2. Products follow the shelf they belong on. Nothing is created or deleted: every statement below
--    moves products that are already in the catalogue onto the shelf that holds their kind of goods.
--    `order_items` keeps its own name and price snapshot, so past orders and bills do not move.
--    This runs before the shelves are filed away below, so that step sees each shelf's final contents
--    and does not switch on a shelf whose goods have just left it.
-- ----------------------------------------------------------------------------
-- Masala powders were sitting loose on the Grocery parent, where the Categories screen could not reach them.
update public.products p set category_id = dst.id
from public.categories src, public.categories dst
where src.slug = 'grocery' and dst.slug = 'masala-spices' and p.category_id = src.id
  and p.slug in ('dhaniya-powder-500-g', 'haldi-powder-500-g', 'lal-mirch-powder-500-g');

-- Loose chai leaves are a kitchen staple, not a cold drink.
update public.products p set category_id = dst.id
from public.categories src, public.categories dst
where src.slug = 'grocery' and dst.slug = 'tea' and p.category_id = src.id
  and p.slug = 'mateshwari-gold-chai-1';

-- Chocolate bars were filed under Dairy -> Milk. They are confectionery.
update public.products p set category_id = dst.id
from public.categories src, public.categories dst
where src.slug = 'milk' and dst.slug = 'chocolates' and p.category_id = src.id
  and p.slug in ('cadbury-dairy-milk-20g', 'cadbury-dairy-milk-1-pc', 'cadbury-dairy-milk-silk-1-pc');

-- Colas and fizzy orange are soft drinks; the mango drink stays under Juice.
update public.products p set category_id = dst.id
from public.categories src, public.categories dst
where src.slug = 'juice' and dst.slug = 'soft-drinks' and p.category_id = src.id
  and p.slug in ('campa-500-ml', 'mirinda-orange-drink-750-ml', 'mountain-dew-400ml');

-- Packaged water was sitting on the Beverages parent itself; anything else left there is a drink.
update public.products p set category_id = dst.id
from public.categories src, public.categories dst
where src.slug = 'beverages' and p.category_id = src.id
  and dst.slug = case when p.slug = 'bisleri-bottle' then 'water' else 'soft-drinks' end;

-- Halwai sweets move off the parent onto the Mithai shelf.
update public.products p set category_id = dst.id
from public.categories src, public.categories dst
where src.slug = 'sweets' and dst.slug = 'mithai' and p.category_id = src.id;

-- ----------------------------------------------------------------------------
-- 3. Lines that used to stand on their own are filed under one of the four. A line that is missing
--    from this database is simply skipped. `on_if` switches a shelf on when it holds something.
-- ----------------------------------------------------------------------------
with shelf(slug, parent_slug, sort) as (values
  -- Grocery & Kitchen: the kirana staples, the spice shelves, dairy, and tea and coffee, which are
  -- bought with the monthly ration rather than drunk from a bottle.
  ('atta', 'grocery', 1), ('flour', 'grocery', 2), ('rice', 'grocery', 3), ('dal', 'grocery', 4),
  ('pulses', 'grocery', 5), ('oil', 'grocery', 6), ('masala-spices', 'grocery', 7),
  ('turmeric', 'grocery', 8), ('red-chilli', 'grocery', 9), ('coriander', 'grocery', 10),
  ('cumin', 'grocery', 11), ('garam-masala', 'grocery', 12), ('whole-spices', 'grocery', 13),
  ('sugar', 'grocery', 14), ('salt', 'grocery', 15), ('dry-fruits', 'grocery', 16),
  ('tea', 'grocery', 17), ('coffee', 'grocery', 18),
  ('milk', 'grocery', 19), ('curd', 'grocery', 20), ('paneer', 'grocery', 21),
  ('butter', 'grocery', 22), ('cheese', 'grocery', 23), ('kitchen-essentials', 'grocery', 24),
  -- Snacks & Drinks.
  ('soft-drinks', 'snacks', 1), ('juice', 'snacks', 2), ('water', 'snacks', 3), ('chocolates', 'snacks', 4),
  ('biscuits', 'snacks', 5), ('chips', 'snacks', 6), ('namkeen', 'snacks', 7),
  -- Sweets & Bakery. Bakery keeps its slug, so /c/bakery-cakes still works.
  ('bakery-cakes', 'sweets', 2),
  -- Beauty & Personal Care.
  ('bath-body', 'personal-care', 1), ('oral-care', 'personal-care', 2), ('hair-care', 'personal-care', 3)
)
update public.categories c set
  parent_id = p.id,
  sort_order = shelf.sort,
  is_featured = false,
  is_active = c.is_active or exists (select 1 from public.products pr where pr.category_id = c.id and pr.is_active)
from shelf join public.categories p on p.slug = shelf.parent_slug
where c.slug = shelf.slug;

update public.categories set name = 'Bakery & Cakes' where slug = 'bakery-cakes';

-- ----------------------------------------------------------------------------
-- 4. Everything outside the new tree is switched off. The rows stay — reports, past orders and the
--    admin panel still list them — and an admin can switch any of them back on.
--    Sub-categories of the four are left alone: what an admin switches on there is theirs to keep.
-- ----------------------------------------------------------------------------
update public.categories c set is_active = false, is_featured = false
where c.slug not in ('grocery', 'snacks', 'sweets', 'personal-care')
  and not exists (
    select 1 from public.categories p
    where p.id = c.parent_id and p.slug in ('grocery', 'snacks', 'sweets', 'personal-care')
  );
