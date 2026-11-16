-- ============================================================================
-- MERTA DEAL — The shop keeps four lines and their shelves. The rest are removed.
--
-- 0054 moved every category into one of four top-level lines and switched off whatever was left
-- over, on the reasoning that a switched-off row costs nothing and can be switched back on. In
-- practice it did cost something: thirty-three dead rows sat in every category picker in the admin
-- panel — the product form, the Products / Photo studio / Inventory filters, Coupons, Promotions —
-- and the owner reads that list every time a product is filed. They are removed here.
--
-- What this file will and will not delete:
--   * A category is removed only if it is switched off AND holds no product at all. A category with
--     goods in it is left exactly where it is; `products.category_id` is `on delete restrict`, so a
--     mistake here would abort the migration rather than orphan a product.
--   * Sub-categories go first, then the lines above them, and only once nothing is left underneath.
--     A switched-off line still holding a switched-on shelf is therefore kept.
--   * Anything switched on is untouched, so the four lines and every shelf a customer can reach
--     survive unchanged, with their slugs — /c/grocery, /c/snacks, /c/sweets, /c/personal-care,
--     /c/bakery-cakes, /c/dry-fruits and the rest still land where they always did.
--
-- Two side effects, both known and accepted before this was written:
--   * `coupons.category_id` is `on delete cascade`, so a coupon restricted to a removed category goes
--     with it. On this database that is FRESH20 ("20% off fruits & vegetables"), expired 3 Nov 2026
--     and never used once.
--   * `promotions.category_id` is `on delete set null`, so a collection pointing at a removed line
--     survives and simply stops pointing at it ("Rajasthan Local Picks", already switched off).
--   * A link to a removed line (/c/dairy, /c/household) now 404s instead of showing "not available
--     right now". No page of this site links to one: the delivery-area page tests the slug before it
--     prints a link, and the about page links only to lines that are still here.
-- ============================================================================

-- 1. Shelves: switched off, empty, and under some line.
delete from public.categories c
where not c.is_active
  and c.parent_id is not null
  and not exists (select 1 from public.products p where p.category_id = c.id);

-- 2. Lines: switched off, empty, and with nothing left underneath them after step 1.
delete from public.categories c
where not c.is_active
  and c.parent_id is null
  and not exists (select 1 from public.products p where p.category_id = c.id)
  and not exists (select 1 from public.categories k where k.parent_id = c.id);
