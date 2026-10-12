-- ============================================================================
-- MERTA DEAL — Shyam Filtered Groundnut Oil, 15 kg tin (added 2026-10-10).
-- Rate ₹3,100 with 5% off → sells at ₹2,945. Photo to be imported via Admin → Products.
-- ============================================================================
insert into public.brands (name, slug) values ('Shyam', 'shyam') on conflict (slug) do nothing;

insert into public.products (name, slug, brand_id, category_id, weight_value, weight_unit, pack_label, mrp, synonyms, tags, is_local, is_veg, description, manufacturer, country_of_origin, nutrition, popularity_score)
select 'Shyam Filtered Groundnut Oil', 'shyam-filtered-groundnut-oil-15-kg', b.id, c.id, 15, 'kg', '15 kg tin', 3100,
  '{shyam,syam,groundnut,moongphali,mungfali,tel,oil,tin,dabba}'::text[], '{staple,bulk}'::text[], false, true,
  'Filtered groundnut (moongphali) oil in a 15 kg tin — pure, healthy, tasty. 100% natural, no chemicals or additives. FSSAI 12218026000381.',
  'Shyam Oil Industries', 'India',
  '{"energy_kcal": 900, "fat_g": 100, "saturated_fat_g": 23, "monounsaturated_fat_g": 52.5, "polyunsaturated_fat_g": 24.5, "trans_fat_g": 0, "cholesterol_mg": 0, "sodium_mg": 0}'::jsonb, 70
from public.brands b, public.categories c where b.slug = 'shyam' and c.slug = 'oil'
on conflict (slug) do nothing;

insert into public.inventory (store_id, product_id, selling_price, mrp, stock_qty, low_stock_threshold, max_order_qty)
select s.store_id, p.id, 2945, 3100, 10, 2, 2
from public.products p
join (select distinct i.store_id from public.inventory i join public.products x on x.id = i.product_id where x.slug in ('dhara-groundnut-oil-1-l','fortune-sunlite-refined-sunflower-oil-1-l') and i.is_active) s on true
where p.slug = 'shyam-filtered-groundnut-oil-15-kg'
on conflict (store_id, product_id) do nothing;

insert into public.search_synonyms (term, canonical) values ('syam','shyam'),('moongphali','groundnut'),('mungfali','groundnut'),('dabba','tin') on conflict (term) do nothing;
