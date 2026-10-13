-- ============================================================================
-- MERTA DEAL — Product form saves no longer clobber stock or visibility.
-- * upsert_store_product overwrote stock_qty with the number the edit form had loaded. If an order sold
--   units while the form was open, saving put them back (overselling) and the change was never logged.
--   p_stock_qty is now optional: NULL keeps the live count (edits use the logged adjust_stock instead).
-- * Every save also forced is_active = true, so editing a hidden product silently showed it again.
--   New optional p_is_active: NULL keeps the current visibility; new listings default to visible.
-- ============================================================================
drop function if exists public.upsert_store_product(uuid, text, uuid, text, numeric, text, text, numeric, numeric, int, int, text, text, boolean, boolean, uuid, int);

create or replace function public.upsert_store_product(
  p_store_id uuid, p_name text, p_category_id uuid, p_brand_name text, p_weight_value numeric, p_weight_unit text, p_pack_label text,
  p_mrp numeric, p_selling_price numeric, p_stock_qty int, p_low_stock_threshold int default 5, p_description text default null,
  p_image_url text default null, p_is_local boolean default false, p_is_veg boolean default true, p_product_id uuid default null, p_max_order_qty int default null, p_is_active boolean default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pid uuid := p_product_id; v_bid uuid; v_slug text; v_inv uuid;
begin
  if not (public.is_store_member(p_store_id) or public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_selling_price > p_mrp then raise exception 'PRICE_ABOVE_MRP'; end if;
  if p_stock_qty is not null and p_stock_qty < 0 then raise exception 'INVALID_STOCK'; end if;
  if p_brand_name is not null and length(trim(p_brand_name)) > 0 then
    insert into public.brands (name, slug) values (trim(p_brand_name), public.slugify(p_brand_name))
    on conflict (name) do update set updated_at = now() returning id into v_bid;
  end if;
  if v_pid is null then
    v_slug := public.slugify(p_name || ' ' || coalesce(p_pack_label,''));
    if exists (select 1 from public.products where slug = v_slug) then v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 6); end if;
    insert into public.products (name, slug, brand_id, category_id, created_by_store_id, description, weight_value, weight_unit, pack_label, mrp, image_url, is_local, is_veg, is_approved)
    values (p_name, v_slug, v_bid, p_category_id, p_store_id, p_description, p_weight_value, p_weight_unit, p_pack_label, p_mrp, p_image_url, p_is_local, p_is_veg,
            not public.get_setting_bool('require_product_approval', false))
    returning id into v_pid;
  else
    -- Stores may only edit master data of products they created; catalog products are admin-managed.
    update public.products set name = p_name, brand_id = coalesce(v_bid, brand_id), category_id = p_category_id, description = coalesce(p_description, description),
      weight_value = p_weight_value, weight_unit = p_weight_unit, pack_label = p_pack_label, mrp = p_mrp, image_url = coalesce(p_image_url, image_url), is_local = p_is_local, is_veg = p_is_veg
    where id = v_pid and (created_by_store_id = p_store_id or public.is_admin());
  end if;
  insert into public.inventory (store_id, product_id, selling_price, mrp, stock_qty, low_stock_threshold, max_order_qty, is_active)
  values (p_store_id, v_pid, p_selling_price, p_mrp, coalesce(p_stock_qty, 0), p_low_stock_threshold, coalesce(p_max_order_qty, (public.get_setting_num('default_max_order_qty', 5))::int), coalesce(p_is_active, true))
  on conflict (store_id, product_id) do update set selling_price = excluded.selling_price, mrp = excluded.mrp,
    stock_qty = case when p_stock_qty is null then public.inventory.stock_qty else excluded.stock_qty end,
    low_stock_threshold = excluded.low_stock_threshold, max_order_qty = coalesce(p_max_order_qty, public.inventory.max_order_qty),
    is_active = coalesce(p_is_active, public.inventory.is_active), updated_at = now()
  returning id into v_inv;
  return jsonb_build_object('product_id', v_pid, 'inventory_id', v_inv);
end $$;

revoke execute on function public.upsert_store_product(uuid, text, uuid, text, numeric, text, text, numeric, numeric, int, int, text, text, boolean, boolean, uuid, int, boolean) from public, anon;
grant execute on function public.upsert_store_product(uuid, text, uuid, text, numeric, text, text, numeric, numeric, int, int, text, text, boolean, boolean, uuid, int, boolean) to authenticated;
