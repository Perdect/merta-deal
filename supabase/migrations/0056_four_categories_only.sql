-- ============================================================================
-- MERTA DEAL — The catalogue is four categories. The shelves under them are removed.
--
-- 0054 arranged everything under four top-level lines; 0055 deleted the switched-off leftovers.
-- What remained was four lines and eighteen shelves (Atta, Rice, Chocolates, Bakery & Cakes …).
-- Eight of those shelves held nothing at all, and the rest held one to three products each, so a
-- customer tapping "Grocery & Kitchen" met a row of nearly-empty drawers, and the owner filing a
-- product chose from twenty-two options to describe a shop with twenty-eight products in it.
-- The shelves go; the four lines stay.
--
-- What happens to the goods:
--   * Every product is re-filed onto the line its shelf sat under BEFORE anything is deleted, so no
--     product is lost or orphaned. `products.category_id` is `on delete restrict`, which means a
--     mistake in step 1 aborts step 2 instead of destroying data.
--   * 28 products move: 6 from the Grocery shelves, 8 from the Snacks shelves, 14 from Mithai and
--     Bakery & Cakes. Their listings, prices, stock, photos and slugs are untouched — only the
--     category they are filed under changes.
--
-- What this costs, accepted before it was written:
--   * /c/dry-fruits, /c/bakery-cakes, /c/chocolates and the other sixteen shelf pages stop existing.
--     next.config.ts redirects each one to its line, so a link in Google or on someone's phone still
--     lands on the goods. If a shelf is ever brought back with the same slug, its redirect has to be
--     deleted there or it will shadow the real page.
--   * The sub-category chips and the category filter disappear from the four line pages, because
--     search_products resolves a slug to itself plus its children and there are no children now.
--   * No coupon and no promotion points at a shelf on this database, so nothing follows them out
--     (`coupons.category_id` would cascade, `promotions.category_id` would be set to null).
--
-- The two-level tree itself still works: this removes rows, not the ability to add a shelf later
-- from Admin → Categories.
-- ============================================================================

-- 1. Move the goods up to the line, while the shelves still exist to read the parent from.
update public.products p
set category_id = c.parent_id
from public.categories c
where c.id = p.category_id
  and c.parent_id is not null;

-- 2. The shelves are empty now, so they can go.
delete from public.categories where parent_id is not null;

-- 3. Refuse to finish on a half-done catalogue.
do $$
declare n int;
begin
  select count(*) into n from public.categories where parent_id is not null;
  if n > 0 then raise exception '0056: % sub-categories are still here', n; end if;

  select count(*) into n from public.products p
  where p.category_id is not null
    and not exists (select 1 from public.categories c where c.id = p.category_id);
  if n > 0 then raise exception '0056: % products point at a category that is gone', n; end if;
end $$;
