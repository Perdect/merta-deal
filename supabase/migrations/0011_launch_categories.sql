-- ============================================================================
-- MERTA DEAL — Launch scope: Grocery, Fruits, Vegetables only.
-- Categories are data, so this is a data change plus one view guard. Nothing is
-- deleted: the rest of the catalogue stays in place, inactive, ready for phase 2.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fruits and Vegetables become top-level cards in place of the combined
--    "Fruits & Vegetables" tile.
-- ----------------------------------------------------------------------------
update public.categories
set parent_id = null, is_active = true, is_featured = true,
    icon = 'apple', color = '#FCE9EE', sort_order = 2,
    description = 'Seasonal fruit from the Merta mandi'
where slug = 'fruits';

update public.categories
set parent_id = null, is_active = true, is_featured = true,
    icon = 'carrot', color = '#E3F5E1', sort_order = 3,
    description = 'Fresh sabzi, picked daily'
where slug = 'vegetables';

update public.categories
set is_active = true, is_featured = true, sort_order = 1,
    description = 'Atta, rice, dal, oil, sugar and daily staples'
where slug = 'grocery';

-- ----------------------------------------------------------------------------
-- 2. Everything else is out of launch scope. Grocery keeps its subcategories
--    (atta, rice, dal, pulses, sugar, salt, oil, flour) so its filters still work.
-- ----------------------------------------------------------------------------
with keep as (
  select id from public.categories where slug in ('grocery', 'fruits', 'vegetables')
  union
  select c.id from public.categories c
  join public.categories p on p.id = c.parent_id
  where p.slug = 'grocery'
)
update public.categories
set is_active = false, is_featured = false
where id not in (select id from keep);

-- ----------------------------------------------------------------------------
-- 3. Products follow their category. v_product_cards is the single source for
--    the home rails, search, suggestions and product detail, so guarding it here
--    hides out-of-scope products everywhere at once — best sellers and
--    recommendations included — without touching a dozen call sites.
-- ----------------------------------------------------------------------------
create or replace view public.v_product_cards with (security_invoker = true) as
select
  p.id, p.name, p.slug, p.pack_label, p.weight_value, p.weight_unit, p.image_url, p.images, p.mrp as base_mrp,
  p.category_id, c.name as category_name, c.slug as category_slug,
  p.brand_id, b.name as brand_name, b.slug as brand_slug,
  p.is_local, p.is_veg, p.popularity_score, p.rating_avg, p.rating_count, p.tags, p.created_at,
  o.inventory_id, o.store_id, o.store_name, o.store_slug, o.selling_price, o.mrp,
  o.stock_qty, o.status as stock_status, o.max_order_qty,
  case when o.mrp > 0 then round(((o.mrp - o.selling_price) / o.mrp) * 100) else 0 end as discount_pct
from public.products p
join public.categories c on c.id = p.category_id
left join public.brands b on b.id = p.brand_id
left join lateral (
  select i.id as inventory_id, i.store_id, s.name as store_name, s.slug as store_slug,
         i.selling_price, i.mrp, i.stock_qty, i.status, i.max_order_qty
  from public.inventory i
  join public.stores s on s.id = i.store_id and s.status = 'active'
  where i.product_id = p.id and i.is_active
  order by (i.status <> 'out_of_stock') desc, s.is_open desc, i.selling_price asc
  limit 1
) o on true
where p.is_active and p.is_approved
  and c.is_active
  and (c.parent_id is null or exists (select 1 from public.categories pc where pc.id = c.parent_id and pc.is_active));

grant select on public.v_product_cards to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Retire the marketing that points at categories customers can no longer open.
-- ----------------------------------------------------------------------------
update public.banners set is_active = false
where link_url is not null
  and (link_url like '/c/local-products%' or link_url like '/c/masala-spices%' or link_url like '/s/sharma-masala-bhandar%');

update public.promotions set is_active = false
where category_id in (select id from public.categories where not is_active);

-- ----------------------------------------------------------------------------
-- 5. Drop Jodhpur, Ajmer, Pali and Jaipur from the "coming soon" list. Nagaur
--    stays. Guarded so it cannot orphan a store, zone, rider or profile.
-- ----------------------------------------------------------------------------
delete from public.cities c
where c.slug in ('jodhpur', 'ajmer', 'pali', 'jaipur')
  and not exists (select 1 from public.stores s where s.city_id = c.id)
  and not exists (select 1 from public.delivery_zones z where z.city_id = c.id)
  and not exists (select 1 from public.delivery_partners d where d.city_id = c.id)
  and not exists (select 1 from public.profiles p where p.city_id = c.id)
  and not exists (select 1 from public.banners b where b.city_id = c.id);
