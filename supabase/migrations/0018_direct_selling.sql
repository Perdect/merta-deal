-- ============================================================================
-- MERTA DEAL — Sell directly instead of through partner kirana stores (2026-10-10).
-- The order / rider / dashboard system stays store-based, so Merta Deal becomes
-- the one store: owned by the super-admin (fulfils from /store), one inventory
-- row per product. Partner stores are closed (status only — reversible), their
-- stock rows deactivated, open carts moved across, and orders still open at the
-- partner stores (setup/demo orders) cancelled the way cancel_order does it.
-- Past orders keep their original store. Address/coordinates are a Gandhi Chowk
-- placeholder — set the real shop in Admin → Stores.
-- ============================================================================

-- 1. Cancel orders still open at partner stores (mirrors public.cancel_order: restock, stop riders, refund, status history).
do $$
declare o record; v_item record; v_reason text := 'Merta Deal now sells directly; this order was cancelled during the switchover.';
begin
  for o in select id from public.orders
           where status in ('placed','store_confirmed','preparing','ready_for_pickup','rider_assigned','out_for_delivery')
             and store_id in (select id from public.stores where slug <> 'merta-deal')
           for update loop
    for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
      update public.inventory set stock_qty = stock_qty + v_item.quantity, sold_count = greatest(sold_count - v_item.quantity, 0) where id = v_item.inventory_id;
      insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, v_item.quantity, 'cancel_restock', o.id, null);
    end loop;
    update public.delivery_assignments set status = 'cancelled' where order_id = o.id and status in ('offered','accepted','picked_up');
    update public.orders set cancel_reason = v_reason where id = o.id;
    perform public._handle_refund_on_cancel(o.id);
    perform public._set_order_status(o.id, 'cancelled', v_reason);
  end loop;
end $$;

-- 2. The Merta Deal store, owned by the super-admin.
insert into public.stores (owner_id, city_id, name, slug, tagline, description, owner_name, phone, email, address_line1, area, pincode, lat, lng,
                           delivery_radius_km, status, is_open, opening_time, closing_time, avg_prep_minutes, is_featured)
select p.id, c.id, 'Merta Deal', 'merta-deal', 'Merta Ki Shopping, Ab Online.', 'Groceries, fruits and vegetables delivered directly by Merta Deal.',
       coalesce(p.full_name, 'Merta Deal'), '8875020202', 'support@mertadeal.com', 'Gandhi Chowk', 'Merta Central', '341510', 26.6478, 74.0322,
       15, 'active', true, '07:00', '22:00', 10, true
from public.profiles p, public.cities c
where p.phone = '9460767676' and c.slug = 'merta-city'
on conflict (slug) do nothing;

-- 3. One row per product: today's best offer (in stock → cheapest), stock pooled across the partner stores.
insert into public.inventory (store_id, product_id, selling_price, mrp, stock_qty, low_stock_threshold, max_order_qty, is_active)
select ms.id, best.product_id, best.selling_price, best.mrp, pool.stock, 5, best.max_order_qty, true
from public.stores ms
join lateral (
  select distinct on (i.product_id) i.product_id, i.selling_price, i.mrp, i.max_order_qty
  from public.inventory i join public.stores s on s.id = i.store_id
  where i.is_active and s.status = 'active' and s.slug <> 'merta-deal'
  order by i.product_id, (i.status <> 'out_of_stock') desc, i.selling_price asc
) best on true
join lateral (
  select coalesce(sum(i.stock_qty), 0)::int as stock from public.inventory i join public.stores s on s.id = i.store_id
  where i.product_id = best.product_id and i.is_active and s.status = 'active' and s.slug <> 'merta-deal'
) pool on true
where ms.slug = 'merta-deal'
on conflict (store_id, product_id) do nothing;

-- 4. Open carts follow their items to Merta Deal; anything it does not stock is dropped.
delete from public.cart_items ci using public.carts c
where ci.cart_id = c.id and c.status = 'active'
  and not exists (select 1 from public.inventory mi join public.stores ms on ms.id = mi.store_id and ms.slug = 'merta-deal' where mi.product_id = ci.product_id);
update public.cart_items ci set inventory_id = mi.id
from public.carts c, public.inventory mi, public.stores ms
where ci.cart_id = c.id and c.status = 'active' and ms.slug = 'merta-deal' and mi.store_id = ms.id and mi.product_id = ci.product_id
  and ci.inventory_id <> mi.id;
update public.carts c set store_id = ms.id, updated_at = now()
from public.stores ms where ms.slug = 'merta-deal' and c.status = 'active' and c.store_id is distinct from ms.id;

-- 5. Close the partner stores (status only; history intact).
update public.inventory i set is_active = false from public.stores s where s.id = i.store_id and s.slug <> 'merta-deal' and i.is_active;
update public.stores set status = 'closed', is_featured = false, updated_at = now() where slug <> 'merta-deal' and status <> 'closed';
