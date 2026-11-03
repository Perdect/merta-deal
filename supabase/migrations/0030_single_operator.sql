-- ============================================================================
-- MERTA DEAL — Single-operator model: the marketplace "store" concept is removed everywhere.
--
-- Merta Deal itself sells, packs and delivers. There are no merchant stores, store owners/staff,
-- store registration, commissions or store payouts any more. Orders are confirmed automatically
-- (0028), packed by Merta Deal (admin panel) and delivered by riders.
--
-- Data: the one live store becomes the business's pickup point (settings.pickup_point). Listings,
-- orders and history of every other store (closed demo stores) are deleted; everything belonging to
-- the live store is kept. Store reviews, store-scoped coupons and store payouts are deleted.
--
-- Schema: stores, store_staff, store_documents, store_commissions and payouts are dropped, along with
-- every store_id / commission column, the store_owner / store_staff roles, the 'store' review target
-- and the store storage buckets. order_status 'store_confirmed' becomes 'confirmed'.
--
-- Functions: store_update_order -> fulfil_order (admin), upsert_store_product -> upsert_product (admin),
-- notify_store -> notify_admins; every other function loses its store logic. search_products and
-- validate_coupon drop their p_store_id parameter.
--
-- The whole file is idempotent (safe to re-run).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Business settings (replace per-store fields)
-- ---------------------------------------------------------------------------
do $$
declare s record; v_pp jsonb; v_open boolean := true; v_from time := time '06:00'; v_to time := time '23:00';
begin
  v_pp := jsonb_build_object('name', 'Merta Deal', 'phone', null, 'address_line1', 'Gandhi Chowk', 'area', 'Merta Central', 'pincode', '341510',
                             'lat', 26.6478, 'lng', 74.0322, 'city_id', null);
  if to_regclass('public.stores') is not null then
    execute $q$select s.name, s.phone, s.address_line1, s.area, s.pincode, s.lat, s.lng, s.city_id, s.is_open, s.opening_time, s.closing_time
               from public.stores s
               order by (s.status = 'active') desc, (select count(*) from public.inventory i where i.store_id = s.id and i.is_active) desc, s.created_at
               limit 1$q$ into s;
    if s.name is not null then
      v_pp := jsonb_build_object('name', s.name, 'phone', s.phone, 'address_line1', s.address_line1, 'area', s.area, 'pincode', s.pincode,
                                 'lat', s.lat, 'lng', s.lng, 'city_id', s.city_id);
      v_open := coalesce(s.is_open, true); v_from := coalesce(s.opening_time, v_from); v_to := coalesce(s.closing_time, v_to);
    end if;
  end if;
  insert into public.settings (key, value, "group", label, description, is_public) values
    ('pickup_point', v_pp, 'business', 'Pickup point', 'Where riders collect orders: name, phone, address, area, pincode, lat, lng, city_id.', false),
    ('business_open', to_jsonb(v_open), 'business', 'Accepting orders', 'Switch off to stop taking new orders (scheduled orders still queue up).', true),
    ('business_hours', jsonb_build_object('open', to_char(v_from, 'HH24:MI'), 'close', to_char(v_to, 'HH24:MI')),
      'business', 'Business hours', 'Orders are accepted between these times (IST).', true)
  on conflict (key) do nothing;
end $$;

create or replace function public.pickup_point()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.settings where key = 'pickup_point'), '{}'::jsonb);
$$;

create or replace function public.is_business_open()
returns boolean language sql stable security definer set search_path = public as $$
  select public.get_setting_bool('business_open', true)
     and coalesce((
       select (now() at time zone 'Asia/Kolkata')::time between (h ->> 'open')::time and (h ->> 'close')::time
       from (select public.get_setting('business_hours') as h) x
       where h ? 'open' and h ? 'close'), true);
$$;

-- Replaces notify_store: operational messages go to every active admin.
create or replace function public.notify_admins(p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles where role in ('admin','super_admin') and is_active loop
    perform public.notify_user(r.id, p_type, p_title, p_body, p_data);
  end loop;
end $$;
revoke all on function public.notify_admins(text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Data: keep the live store's data, remove everything that belonged to other stores
-- ---------------------------------------------------------------------------
do $$
declare v_keep uuid;
begin
  if to_regclass('public.stores') is null then return; end if;
  execute $q$select s.id from public.stores s
             order by (s.status = 'active') desc, (select count(*) from public.inventory i where i.store_id = s.id and i.is_active) desc, s.created_at
             limit 1$q$ into v_keep;
  if v_keep is null then return; end if;
  execute 'delete from public.rider_earnings where order_id in (select id from public.orders where store_id <> $1)' using v_keep;
  execute 'delete from public.orders where store_id <> $1' using v_keep;
  execute 'delete from public.inventory where store_id <> $1' using v_keep;
  execute 'delete from public.coupons where store_id is not null';
  execute $q$delete from public.reviews where target::text = 'store'$q$;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Drop store-dependent policies, functions and the product view
-- ---------------------------------------------------------------------------
drop policy if exists categories_read on public.categories;
drop policy if exists brands_store_insert on public.brands;
drop policy if exists products_read on public.products;
drop policy if exists products_store_insert on public.products;
drop policy if exists products_store_update on public.products;
drop policy if exists inventory_read on public.inventory;
drop policy if exists inventory_store_write on public.inventory;
drop policy if exists inventory_movements_read on public.inventory_movements;
drop policy if exists coupons_read on public.coupons;
drop policy if exists orders_read on public.orders;
drop policy if exists reviews_read on public.reviews;

-- cascade: the only dependents are the policies of the store tables (dropped below anyway) and the
-- storage policies for store buckets.
drop function if exists public.is_store_member(uuid) cascade;
drop function if exists public.my_store_ids() cascade;
drop function if exists public.nearby_stores(double precision, double precision, numeric, int) cascade;
drop function if exists public.notify_store(uuid, text, text, text, jsonb) cascade;
drop function if exists public.admin_notify_store(uuid, text, text, text, jsonb);
drop function if exists public.admin_store_stats(uuid);
drop function if exists public.store_dashboard_stats(uuid);
drop function if exists public.store_add_staff(uuid, text, public.store_staff_role);
drop function if exists public.store_list_staff(uuid);
drop function if exists public.store_remove_staff(uuid);
drop function if exists public.store_update_order(uuid, text, text);
drop function if exists public.upsert_store_product(uuid, text, uuid, text, numeric, text, text, numeric, numeric, int, int, text, text, boolean, boolean, uuid, int, boolean);
drop function if exists public.admin_generate_payouts(date, date);
drop function if exists public.stores_after_insert_role() cascade;
drop function if exists public.stores_before_insert() cascade;
drop function if exists public.stores_protect_columns() cascade;
-- Signature changes (p_store_id removed) and enum-typed signatures (types are recreated below).
drop function if exists public.search_products(text, text, text[], numeric, numeric, int, boolean, uuid, boolean, text, int, int, boolean);
drop function if exists public.validate_coupon(text, uuid, numeric, uuid[], uuid);
drop function if exists public.submit_review(uuid, public.review_target, int, text, uuid, text);
drop function if exists public.admin_set_user_role(uuid, public.user_role);
drop function if exists public.current_user_role();
drop view if exists public.v_product_cards;

-- ---------------------------------------------------------------------------
-- 4. Schema
-- ---------------------------------------------------------------------------
alter table public.orders drop column if exists store_id;
alter table public.orders drop column if exists commission_rate;
alter table public.orders drop column if exists commission_amount;
alter table public.orders drop column if exists store_payout_amount;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'store_confirmed_at') then
    alter table public.orders rename column store_confirmed_at to confirmed_at;
  end if;
end $$;

alter table public.inventory drop column if exists store_id;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_product_id_key') then
    alter table public.inventory add constraint inventory_product_id_key unique (product_id);
  end if;
end $$;
create index if not exists inventory_status_idx on public.inventory(status);

alter table public.carts drop column if exists store_id;
alter table public.coupons drop column if exists store_id;
alter table public.reviews drop constraint if exists reviews_target_check;
alter table public.reviews drop column if exists store_id;
alter table public.products drop column if exists created_by_store_id;
alter table public.products drop column if exists is_approved;

drop table if exists public.payouts cascade;
drop table if exists public.store_commissions cascade;
drop table if exists public.store_documents cascade;
drop table if exists public.store_staff cascade;
drop table if exists public.stores cascade;
drop type if exists public.store_status;
drop type if exists public.store_staff_role;
drop type if exists public.document_status;

-- order_status: 'store_confirmed' -> 'confirmed'
do $$ begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'order_status' and e.enumlabel = 'store_confirmed') then
    alter type public.order_status rename value 'store_confirmed' to 'confirmed';
  end if;
end $$;

-- user_role: drop store_owner / store_staff (enum values cannot be removed in place, so the type is rebuilt)
do $$ begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'user_role' and e.enumlabel in ('store_owner','store_staff')) then
    alter type public.user_role rename to user_role_old;
    create type public.user_role as enum ('customer','rider','admin','super_admin');
    alter table public.profiles alter column role drop default;
    alter table public.profiles alter column role type public.user_role
      using (case when role::text in ('store_owner','store_staff') then 'customer' else role::text end)::public.user_role;
    alter table public.profiles alter column role set default 'customer';
    alter table public.order_status_history alter column actor_role type public.user_role
      using (case when actor_role::text in ('store_owner','store_staff') then 'admin' else actor_role::text end)::public.user_role;
    alter table public.audit_logs alter column actor_role type public.user_role
      using (case when actor_role::text in ('store_owner','store_staff') then 'admin' else actor_role::text end)::public.user_role;
    drop type public.user_role_old;
  end if;
end $$;

-- review_target: drop 'store'
do $$ begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'review_target' and e.enumlabel = 'store') then
    alter type public.review_target rename to review_target_old;
    create type public.review_target as enum ('product','delivery');
    alter table public.reviews alter column target type public.review_target using target::text::public.review_target;
    drop type public.review_target_old;
  end if;
end $$;
alter table public.reviews add constraint reviews_target_check check (
  (target = 'product' and product_id is not null) or (target = 'delivery' and rider_id is not null));

-- Storage: store buckets and store-member policies go; product images are admin-managed.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then return; end if;
  delete from storage.objects where bucket_id in ('store-photos','store-documents');
  delete from storage.buckets where id in ('store-photos','store-documents');
  execute 'drop policy if exists "store members upload product images" on storage.objects';
  execute 'drop policy if exists "store members manage product images" on storage.objects';
  execute 'drop policy if exists "store members delete product images" on storage.objects';
  execute 'drop policy if exists "store members upload store photos" on storage.objects';
  execute 'drop policy if exists "store docs private read" on storage.objects';
  execute 'drop policy if exists "store docs upload" on storage.objects';
  execute 'drop policy if exists "public read images" on storage.objects';
  execute 'drop policy if exists "admin manage product images" on storage.objects';
  execute $q$create policy "public read images" on storage.objects for select using (bucket_id in ('product-images','avatars','banners'))$q$;
  execute $q$create policy "admin manage product images" on storage.objects for all to authenticated using (bucket_id = 'product-images' and public.is_admin()) with check (bucket_id = 'product-images' and public.is_admin())$q$;
end $$;

delete from public.settings where key in ('commission_default_percent', 'store_accept_window_minutes', 'require_product_approval');

-- ---------------------------------------------------------------------------
-- 5. Product view: one listing per product
-- ---------------------------------------------------------------------------
create or replace view public.v_product_cards with (security_invoker = true) as
select
  p.id, p.name, p.slug, p.pack_label, p.weight_value, p.weight_unit, p.image_url, p.images, p.mrp as base_mrp,
  p.category_id, c.name as category_name, c.slug as category_slug,
  p.brand_id, b.name as brand_name, b.slug as brand_slug,
  p.is_local, p.is_veg, p.popularity_score, p.rating_avg, p.rating_count, p.tags, p.created_at,
  o.inventory_id, o.selling_price, o.mrp,
  o.stock_qty, o.status as stock_status, o.max_order_qty,
  case when o.mrp > 0 then round(((o.mrp - o.selling_price) / o.mrp) * 100) else 0 end as discount_pct
from public.products p
join public.categories c on c.id = p.category_id
left join public.brands b on b.id = p.brand_id
left join lateral (
  select i.id as inventory_id, i.selling_price, i.mrp, i.stock_qty, i.status, i.max_order_qty
  from public.inventory i where i.product_id = p.id and i.is_active limit 1
) o on true
where p.is_active
  and c.is_active
  and (c.parent_id is null or exists (select 1 from public.categories pc where pc.id = c.parent_id and pc.is_active));

-- ---------------------------------------------------------------------------
-- 6. Roles and helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_role in ('admin','super_admin') and not public.is_super_admin() then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  update public.profiles set role = p_role where id = p_user_id;
  if p_role = 'rider' then
    insert into public.delivery_partners (user_id, city_id) values (p_user_id, (select id from public.cities where slug = 'merta-city')) on conflict (user_id) do nothing;
  end if;
  perform public.audit('user.role_change', 'profiles', p_user_id::text, null, jsonb_build_object('role', p_role));
end $$;

create or replace function public.profiles_protect_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_or_service() then
    new.role := old.role;
    new.wallet_balance := old.wallet_balance;
    new.reward_points := old.reward_points;
    new.is_active := old.is_active;
    new.referral_code := old.referral_code;
  elsif auth.uid() is not null and new.role in ('admin','super_admin') and old.role not in ('admin','super_admin') and not public.is_super_admin() then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;
  return new;
end $$;

-- Products are admin-managed (RLS); internal security-definer paths (order popularity, rating
-- recomputation) update them on a customer's behalf, so the trigger only fills in the slug.
create or replace function public.products_protect_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.slug is null or new.slug = '' then new.slug := public.slugify(new.name || ' ' || coalesce(new.pack_label,'')); end if;
  return new;
end $$;

create or replace function public.can_view_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and (o.user_id = auth.uid() or public.is_admin() or public.is_assigned_rider(o.id)));
$$;

create or replace function public.can_view_rider(p_rider_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.delivery_partners dp where dp.id = p_rider_id and dp.user_id = auth.uid())
      or public.is_admin()
      or exists (
        select 1 from public.delivery_assignments a join public.orders o on o.id = a.order_id
        where a.rider_id = p_rider_id and a.status in ('accepted','picked_up','delivered') and o.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 7. Catalogue and stock
-- ---------------------------------------------------------------------------
create or replace function public.inventory_sync_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_new public.inventory_status; v_name text;
begin
  v_new := case
    when new.stock_qty <= 0 then 'out_of_stock'
    when new.stock_qty <= new.low_stock_threshold then 'low_stock'
    else 'in_stock' end;
  new.status := v_new;
  if tg_op = 'UPDATE' and old.status is distinct from v_new and v_new in ('low_stock','out_of_stock') then
    select name into v_name from public.products where id = new.product_id;
    perform public.notify_admins('low_stock',
      case when v_new = 'out_of_stock' then 'Out of stock: ' || v_name else 'Low stock: ' || v_name end,
      format('%s has %s units left. Update stock to keep receiving orders.', v_name, new.stock_qty),
      jsonb_build_object('inventory_id', new.id, 'product_id', new.product_id, 'stock_qty', new.stock_qty));
  end if;
  return new;
end $$;

create or replace function public.adjust_stock(p_inventory_id uuid, p_delta int, p_reason text default 'manual_adjust', p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare inv public.inventory;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into inv from public.inventory where id = p_inventory_id for update;
  if inv.id is null then raise exception 'NOT_FOUND'; end if;
  if inv.stock_qty + p_delta < 0 then raise exception 'NEGATIVE_STOCK'; end if;
  update public.inventory set stock_qty = stock_qty + p_delta where id = inv.id;
  insert into public.inventory_movements (inventory_id, delta, reason, actor_id, note) values (inv.id, p_delta, p_reason, auth.uid(), p_note);
  return inv.stock_qty + p_delta;
end $$;

-- Admin product save (replaces upsert_store_product). NULL stock keeps the live count; NULL visibility keeps it.
create or replace function public.upsert_product(
  p_name text, p_category_id uuid, p_brand_name text, p_weight_value numeric, p_weight_unit text, p_pack_label text,
  p_mrp numeric, p_selling_price numeric, p_stock_qty int, p_low_stock_threshold int default 5, p_description text default null,
  p_image_url text default null, p_is_local boolean default false, p_is_veg boolean default true, p_product_id uuid default null, p_max_order_qty int default null, p_is_active boolean default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pid uuid := p_product_id; v_bid uuid; v_slug text; v_inv uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_selling_price > p_mrp then raise exception 'PRICE_ABOVE_MRP'; end if;
  if p_stock_qty is not null and p_stock_qty < 0 then raise exception 'INVALID_STOCK'; end if;
  if p_brand_name is not null and length(trim(p_brand_name)) > 0 then
    insert into public.brands (name, slug) values (trim(p_brand_name), public.slugify(p_brand_name))
    on conflict (name) do update set updated_at = now() returning id into v_bid;
  end if;
  if v_pid is null then
    v_slug := public.slugify(p_name || ' ' || coalesce(p_pack_label,''));
    if exists (select 1 from public.products where slug = v_slug) then v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 6); end if;
    insert into public.products (name, slug, brand_id, category_id, description, weight_value, weight_unit, pack_label, mrp, image_url, is_local, is_veg)
    values (p_name, v_slug, v_bid, p_category_id, p_description, p_weight_value, p_weight_unit, p_pack_label, p_mrp, p_image_url, p_is_local, p_is_veg)
    returning id into v_pid;
  else
    update public.products set name = p_name, brand_id = coalesce(v_bid, brand_id), category_id = p_category_id, description = coalesce(p_description, description),
      weight_value = p_weight_value, weight_unit = p_weight_unit, pack_label = p_pack_label, mrp = p_mrp, image_url = coalesce(p_image_url, image_url), is_local = p_is_local, is_veg = p_is_veg
    where id = v_pid;
  end if;
  insert into public.inventory (product_id, selling_price, mrp, stock_qty, low_stock_threshold, max_order_qty, is_active)
  values (v_pid, p_selling_price, p_mrp, coalesce(p_stock_qty, 0), p_low_stock_threshold, coalesce(p_max_order_qty, (public.get_setting_num('default_max_order_qty', 5))::int), coalesce(p_is_active, true))
  on conflict (product_id) do update set selling_price = excluded.selling_price, mrp = excluded.mrp,
    stock_qty = case when p_stock_qty is null then public.inventory.stock_qty else excluded.stock_qty end,
    low_stock_threshold = excluded.low_stock_threshold, max_order_qty = coalesce(p_max_order_qty, public.inventory.max_order_qty),
    is_active = coalesce(p_is_active, public.inventory.is_active), updated_at = now()
  returning id into v_inv;
  return jsonb_build_object('product_id', v_pid, 'inventory_id', v_inv);
end $$;
revoke all on function public.upsert_product(text, uuid, text, numeric, text, text, numeric, numeric, int, int, text, text, boolean, boolean, uuid, int, boolean) from public, anon;
grant execute on function public.upsert_product(text, uuid, text, numeric, text, text, numeric, numeric, int, int, text, text, boolean, boolean, uuid, int, boolean) to authenticated;

create or replace function public.search_products(
  p_query text default null,
  p_category_slug text default null,
  p_brand_slugs text[] default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_min_discount int default null,
  p_in_stock boolean default false,
  p_local_only boolean default false,
  p_sort text default 'relevance',
  p_page int default 1,
  p_page_size int default 24,
  p_include_unlisted boolean default false
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tsq tsquery; v_q text; v_cat_ids uuid[]; v_offset int; v_items jsonb; v_total int; v_size int; v_canon text[] := '{}';
begin
  v_size := least(greatest(coalesce(p_page_size, 24), 1), 60);
  v_offset := (greatest(coalesce(p_page, 1), 1) - 1) * v_size;
  v_q := nullif(trim(coalesce(p_query, '')), '');
  if v_q is not null then
    v_canon := public.canonical_terms(v_q);
    begin
      v_tsq := to_tsquery('simple', public.expand_search_query(v_q));
    exception when others then
      v_tsq := plainto_tsquery('simple', extensions.unaccent(v_q));
    end;
  end if;
  if nullif(trim(p_category_slug), '') is not null then
    -- One slug or a comma-separated list, each with all its descendants. An unknown slug matches nothing.
    with recursive tree as (
      select id from public.categories where slug = any(string_to_array(replace(p_category_slug, ' ', ''), ','))
      union
      select c.id from public.categories c join tree t on c.parent_id = t.id
    ) select coalesce(array_agg(id), '{}'::uuid[]) into v_cat_ids from tree;
  end if;

  with base as (
    select v.*,
      case when v_tsq is null then 0
           else ts_rank(p.search_vector, v_tsq) + extensions.similarity(lower(v.name), lower(v_q))
                + 0.5 * (select count(*) from unnest(v_canon) c where lower(v.name) like '%' || c || '%' or lower(v.category_name) like '%' || c || '%') end as rank
    from public.v_product_cards v
    join public.products p on p.id = v.id
    where (v_tsq is null or p.search_vector @@ v_tsq or extensions.similarity(lower(v.name), lower(v_q)) > 0.3)
      and (v_cat_ids is null or v.category_id = any(v_cat_ids))
      and (p_brand_slugs is null or v.brand_slug = any(p_brand_slugs))
      and (p_min_price is null or v.selling_price >= p_min_price)
      and (p_max_price is null or v.selling_price <= p_max_price)
      and (p_min_discount is null or v.discount_pct >= p_min_discount)
      and (not p_in_stock or v.stock_status <> 'out_of_stock')
      and (not p_local_only or v.is_local)
      -- Shoppers only see listed products; the admin "Add from catalogue" picker asks for all.
      and (p_include_unlisted or v.inventory_id is not null)
  ), counted as (select count(*) as total from base),
  paged as (
    select b.* from base b
    order by
      case when p_sort = 'relevance' then b.rank end desc nulls last,
      case when p_sort in ('relevance','popular') then b.popularity_score end desc nulls last,
      case when p_sort = 'price_asc' then b.selling_price end asc nulls last,
      case when p_sort = 'price_desc' then b.selling_price end desc nulls last,
      case when p_sort = 'newest' then b.created_at end desc nulls last,
      case when p_sort = 'discount' then b.discount_pct end desc nulls last,
      b.popularity_score desc, b.name asc
    limit v_size offset v_offset
  )
  select coalesce(jsonb_agg(to_jsonb(paged) - 'rank'), '[]'::jsonb), (select total from counted)
  into v_items, v_total from paged;

  return jsonb_build_object('items', v_items, 'total', v_total, 'page', greatest(coalesce(p_page,1),1), 'page_size', v_size,
                            'has_more', (v_offset + v_size) < v_total);
end $$;

create or replace function public.search_suggest(p_query text, p_limit int default 8)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text; v_tsq tsquery; v_products jsonb; v_brands jsonb; v_cats jsonb;
begin
  v_q := nullif(trim(coalesce(p_query,'')), '');
  if v_q is null or length(v_q) < 2 then return jsonb_build_object('products','[]'::jsonb,'brands','[]'::jsonb,'categories','[]'::jsonb); end if;
  begin v_tsq := to_tsquery('simple', public.expand_search_query(v_q)); exception when others then v_tsq := plainto_tsquery('simple', v_q); end;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug, 'image_url', image_url, 'pack_label', pack_label, 'selling_price', selling_price, 'brand_name', brand_name)), '[]'::jsonb)
  into v_products from (
    select v.id, v.name, v.slug, v.image_url, v.pack_label, v.selling_price, v.brand_name
    from public.v_product_cards v join public.products p on p.id = v.id
    where v.inventory_id is not null and (p.search_vector @@ v_tsq or extensions.similarity(lower(v.name), lower(v_q)) > 0.3)
    order by ts_rank(p.search_vector, v_tsq) desc, v.popularity_score desc limit p_limit
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug)), '[]'::jsonb) into v_brands
  from (select id, name, slug from public.brands where is_active and (name ilike v_q || '%' or extensions.similarity(lower(name), lower(v_q)) > 0.4) order by name limit 4) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug, 'icon', icon)), '[]'::jsonb) into v_cats
  from (select id, name, slug, icon from public.categories where is_active and (name ilike '%' || v_q || '%' or extensions.similarity(lower(name), lower(v_q)) > 0.4) order by sort_order limit 4) x;
  return jsonb_build_object('products', v_products, 'brands', v_brands, 'categories', v_cats);
end $$;

create or replace function public.product_detail(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_p record; r jsonb;
begin
  select * into v_p from public.v_product_cards where slug = p_slug;
  if v_p.id is null then return null; end if;
  r := to_jsonb(v_p);
  r := r || jsonb_build_object(
    'description', (select description from public.products where id = v_p.id),
    'ingredients', (select ingredients from public.products where id = v_p.id),
    'nutrition', (select nutrition from public.products where id = v_p.id),
    'manufacturer', (select manufacturer from public.products where id = v_p.id),
    'country_of_origin', (select country_of_origin from public.products where id = v_p.id),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object(
        'inventory_id', i.id, 'selling_price', i.selling_price, 'mrp', i.mrp, 'stock_qty', i.stock_qty, 'status', i.status,
        'max_order_qty', i.max_order_qty,
        'discount_pct', case when i.mrp > 0 then round(((i.mrp - i.selling_price)/i.mrp)*100) else 0 end
      )), '[]'::jsonb)
      from public.inventory i where i.product_id = v_p.id and i.is_active),
    'related', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (
        select * from public.v_product_cards where category_id = v_p.category_id and id <> v_p.id and inventory_id is not null order by popularity_score desc limit 10) v),
    'frequently_bought', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (
        select v.* from public.v_product_cards v join (
          select oi2.product_id, count(*) n from public.order_items oi1 join public.order_items oi2 on oi1.order_id = oi2.order_id and oi2.product_id <> oi1.product_id
          where oi1.product_id = v_p.id group by oi2.product_id order by n desc limit 8) f on f.product_id = v.id
        where v.inventory_id is not null) v),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'title', r.title, 'comment', r.comment, 'created_at', r.created_at,
        'user_name', coalesce(pr.full_name, 'Customer')) order by r.created_at desc), '[]'::jsonb)
        from public.reviews r join public.profiles pr on pr.id = r.user_id where r.product_id = v_p.id and r.status = 'approved'),
    'in_wishlist', (auth.uid() is not null and exists (select 1 from public.wishlists w where w.user_id = auth.uid() and w.product_id = v_p.id))
  );
  return r;
end $$;

create or replace function public.home_feed(p_lat double precision default null, p_lng double precision default null, p_limit int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r jsonb := '{}'::jsonb;
begin
  r := r || jsonb_build_object('banners', (
    select coalesce(jsonb_agg(to_jsonb(b) order by b.sort_order), '[]'::jsonb) from public.banners b
    where b.is_active and b.placement = 'home_hero' and b.starts_at <= now() and (b.ends_at is null or b.ends_at > now())));
  r := r || jsonb_build_object('categories', (
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon, 'color', c.color, 'image_url', c.image_url) order by c.sort_order), '[]'::jsonb)
    from public.categories c where c.is_active and c.parent_id is null));
  r := r || jsonb_build_object('best_sellers', (
    select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (
      select * from public.v_product_cards where inventory_id is not null order by popularity_score desc, rating_avg desc limit p_limit) v));
  r := r || jsonb_build_object('deals', (
    select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (
      select * from public.v_product_cards where inventory_id is not null and discount_pct >= 10 order by discount_pct desc, popularity_score desc limit p_limit) v));
  r := r || jsonb_build_object('new_arrivals', (
    select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (
      select * from public.v_product_cards where inventory_id is not null order by created_at desc limit p_limit) v));
  r := r || jsonb_build_object('local_products', (
    select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (
      select * from public.v_product_cards where inventory_id is not null and is_local order by popularity_score desc limit p_limit) v));
  r := r || jsonb_build_object('popular', (
    select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (
      select v.* from public.v_product_cards v
      join (select product_id, sum(quantity) q from public.order_items oi join public.orders o on o.id = oi.order_id
            where o.created_at > now() - interval '30 days' and o.status not in ('cancelled','rejected') group by product_id) s on s.product_id = v.id
      where v.inventory_id is not null order by s.q desc limit p_limit) v));
  if v_uid is not null then
    r := r || jsonb_build_object('buy_again', (
      select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (
        select v.* from public.v_product_cards v
        join (select product_id, max(o.created_at) last_at from public.order_items oi join public.orders o on o.id = oi.order_id
              where o.user_id = v_uid and o.status not in ('cancelled','rejected') group by product_id) s on s.product_id = v.id
        where v.inventory_id is not null order by s.last_at desc limit p_limit) v));
    r := r || jsonb_build_object('recommended', (
      select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (
        select v.* from public.v_product_cards v
        where v.inventory_id is not null
          and v.category_id in (
            select p.category_id from public.order_items oi join public.orders o on o.id = oi.order_id join public.products p on p.id = oi.product_id
            where o.user_id = v_uid group by p.category_id order by count(*) desc limit 3)
          and v.id not in (select oi.product_id from public.order_items oi join public.orders o on o.id = oi.order_id where o.user_id = v_uid)
        order by v.popularity_score desc limit p_limit) v));
  else
    r := r || jsonb_build_object('buy_again', '[]'::jsonb, 'recommended', (
      select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (
        select * from public.v_product_cards where inventory_id is not null order by rating_avg desc, popularity_score desc limit p_limit) v));
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Cart and coupons
-- ---------------------------------------------------------------------------
create or replace function public.validate_coupon(p_code text, p_subtotal numeric, p_category_ids uuid[] default null, p_user_id uuid default auth.uid())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.coupons; v_disc numeric := 0; v_user_uses int; v_orders int;
begin
  select * into c from public.coupons where upper(code) = upper(trim(p_code));
  if c.id is null then return jsonb_build_object('valid', false, 'reason', 'Invalid coupon code'); end if;
  if not c.is_active then return jsonb_build_object('valid', false, 'reason', 'This coupon is no longer active'); end if;
  if c.starts_at > now() then return jsonb_build_object('valid', false, 'reason', 'This coupon is not active yet'); end if;
  if c.expires_at is not null and c.expires_at < now() then return jsonb_build_object('valid', false, 'reason', 'This coupon has expired'); end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then return jsonb_build_object('valid', false, 'reason', 'Coupon usage limit reached'); end if;
  if c.category_id is not null and (p_category_ids is null or not (c.category_id = any(p_category_ids))) then
    return jsonb_build_object('valid', false, 'reason', 'Coupon applies to a different category'); end if;
  if p_subtotal < c.min_order_amount then
    return jsonb_build_object('valid', false, 'reason', format('Add items worth ₹%s more to use this coupon', to_char(c.min_order_amount - p_subtotal, 'FM9999990'))); end if;
  if p_user_id is not null then
    select count(*) into v_user_uses from public.coupon_usage where coupon_id = c.id and user_id = p_user_id;
    if v_user_uses >= c.per_user_limit then return jsonb_build_object('valid', false, 'reason', 'You have already used this coupon'); end if;
    if c.first_order_only then
      select count(*) into v_orders from public.orders where user_id = p_user_id and status not in ('cancelled','rejected');
      if v_orders > 0 then return jsonb_build_object('valid', false, 'reason', 'This coupon is only for your first order'); end if;
    end if;
  end if;
  v_disc := case when c.type = 'percentage' then round(p_subtotal * c.value / 100, 2) else c.value end;
  if c.max_discount is not null then v_disc := least(v_disc, c.max_discount); end if;
  v_disc := least(v_disc, p_subtotal);
  return jsonb_build_object('valid', true, 'coupon_id', c.id, 'code', c.code, 'title', c.title, 'discount', v_disc);
end $$;

create or replace function public.apply_coupon(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cart public.carts; v_sub numeric; v_cats uuid[]; v_res jsonb; v_cart_id uuid;
begin
  v_cart_id := public.get_or_create_cart();
  select * into v_cart from public.carts where id = v_cart_id;
  select coalesce(sum(ci.quantity * i.selling_price),0), array_agg(distinct p.category_id)
    into v_sub, v_cats
  from public.cart_items ci join public.inventory i on i.id = ci.inventory_id join public.products p on p.id = ci.product_id
  where ci.cart_id = v_cart.id;
  v_res := public.validate_coupon(p_code, v_sub, v_cats);
  if (v_res ->> 'valid')::boolean then
    update public.carts set coupon_id = (v_res ->> 'coupon_id')::uuid where id = v_cart.id;
  end if;
  return v_res;
end $$;

create or replace function public.clear_cart()
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.get_or_create_cart();
begin
  delete from public.cart_items where cart_id = v_id;
  update public.carts set coupon_id = null where id = v_id;
end $$;

-- p_replace is kept for callers (there is no longer a store conflict to replace).
create or replace function public.add_to_cart(p_inventory_id uuid, p_quantity int default 1, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cart public.carts; v_inv public.inventory; v_cart_id uuid; v_current int; v_allowed int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_cart_id := public.get_or_create_cart();
  -- One writer per cart: concurrent requests (rapid taps, retries, other tabs) wait here.
  select * into v_cart from public.carts where id = v_cart_id for update;
  select quantity into v_current from public.cart_items where cart_id = v_cart.id and inventory_id = p_inventory_id;
  v_current := coalesce(v_current, 0);

  -- Removing always works, even for an item that has since become unavailable.
  if p_quantity <= 0 then
    delete from public.cart_items where cart_id = v_cart.id and inventory_id = p_inventory_id;
    if not exists (select 1 from public.cart_items where cart_id = v_cart.id) then
      update public.carts set coupon_id = null where id = v_cart.id;
    end if;
    return jsonb_build_object('ok', true, 'cart_id', v_cart.id, 'quantity', 0);
  end if;

  select * into v_inv from public.inventory where id = p_inventory_id and is_active;
  if v_inv.id is null then raise exception 'ITEM_UNAVAILABLE'; end if;

  -- Raising a quantity must fit the per-product limit and the stock; lowering is always allowed.
  if p_quantity > v_current then
    if v_inv.stock_qty <= 0 then raise exception 'OUT_OF_STOCK'; end if;
    v_allowed := least(v_inv.max_order_qty, v_inv.stock_qty);
    if p_quantity > v_allowed then
      if v_inv.stock_qty < v_inv.max_order_qty then raise exception 'ONLY_AVAILABLE: %', v_inv.stock_qty; end if;
      raise exception 'MAX_PER_ORDER: %', v_inv.max_order_qty;
    end if;
  end if;

  insert into public.cart_items (cart_id, inventory_id, product_id, quantity, price_at_add)
  values (v_cart.id, p_inventory_id, v_inv.product_id, p_quantity, v_inv.selling_price)
  on conflict (cart_id, inventory_id) do update set quantity = excluded.quantity, price_at_add = excluded.price_at_add, updated_at = now();

  return jsonb_build_object('ok', true, 'cart_id', v_cart.id, 'quantity', p_quantity, 'max_order_qty', v_inv.max_order_qty, 'stock_qty', v_inv.stock_qty);
end $$;

create or replace function public.cart_summary(p_address_id uuid default null, p_delivery_type public.delivery_type default 'standard')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cart public.carts; v_addr public.addresses; v_zone public.delivery_zones; v_pp jsonb := public.pickup_point();
  v_items jsonb; v_sub numeric := 0; v_mrp_total numeric := 0; v_count int := 0;
  v_delivery numeric := 0; v_threshold numeric; v_min_order numeric; v_gap numeric := 0;
  v_platform numeric; v_tax numeric := 0; v_tax_rate numeric; v_coupon jsonb := null; v_coupon_disc numeric := 0;
  v_total numeric; v_cats uuid[]; v_dist numeric; v_express_fee numeric := 0; v_eta_min int; v_eta_max int;
  v_serviceable boolean := true; v_msg text := null; v_issues jsonb := '[]'::jsonb; v_delivery_waived numeric := 0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_cart from public.carts where user_id = auth.uid() and status = 'active';
  if v_cart.id is null then
    return jsonb_build_object('items','[]'::jsonb,'item_count',0,'subtotal',0,'total',0,'empty',true, 'business_open', public.is_business_open());
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ci.id, 'inventory_id', ci.inventory_id, 'product_id', p.id, 'name', p.name, 'slug', p.slug,
      'image_url', p.image_url, 'pack_label', p.pack_label, 'brand_name', b.name,
      'quantity', ci.quantity, 'unit_price', i.selling_price, 'unit_mrp', i.mrp,
      'line_total', ci.quantity * i.selling_price, 'stock_qty', i.stock_qty, 'max_order_qty', i.max_order_qty,
      'available', (i.is_active and i.stock_qty >= ci.quantity),
      'over_limit', ci.quantity > i.max_order_qty,
      'price_at_add', ci.price_at_add,
      'price_changed', (ci.price_at_add is not null and ci.price_at_add <> i.selling_price)
    ) order by ci.created_at), '[]'::jsonb),
    coalesce(sum(ci.quantity * i.selling_price),0), coalesce(sum(ci.quantity * i.mrp),0), coalesce(sum(ci.quantity),0),
    array_agg(distinct p.category_id)
  into v_items, v_sub, v_mrp_total, v_count, v_cats
  from public.cart_items ci
  join public.inventory i on i.id = ci.inventory_id
  join public.products p on p.id = ci.product_id
  left join public.brands b on b.id = p.brand_id
  where ci.cart_id = v_cart.id;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'inventory_id', i.id, 'name', p.name, 'quantity', ci.quantity,
      'available_qty', i.stock_qty, 'max_order_qty', i.max_order_qty,
      'reason', case when not i.is_active then 'unavailable' when i.stock_qty < ci.quantity then 'stock' else 'limit' end)), '[]'::jsonb) into v_issues
  from public.cart_items ci join public.inventory i on i.id = ci.inventory_id join public.products p on p.id = ci.product_id
  where ci.cart_id = v_cart.id and (not i.is_active or i.stock_qty < ci.quantity or ci.quantity > i.max_order_qty);

  -- Address / zone resolution
  if p_address_id is not null then
    select * into v_addr from public.addresses where id = p_address_id and user_id = auth.uid();
  else
    select * into v_addr from public.addresses where user_id = auth.uid() order by is_default desc, created_at desc limit 1;
  end if;
  if v_addr.id is not null then
    v_zone := public.find_zone(v_addr.pincode, v_addr.lat, v_addr.lng);
    if v_zone.id is null then
      v_serviceable := false;
      v_msg := 'Sorry, ' || coalesce(public.get_setting('brand_name') #>> '{}', 'Merta Deal') || ' is not available in your area yet.';
    end if;
  end if;

  v_threshold := coalesce(v_zone.free_delivery_threshold, public.get_setting_num('free_delivery_threshold', 499));
  v_min_order := coalesce(v_zone.min_order_amount, public.get_setting_num('min_order_amount', 99));
  v_delivery := coalesce(v_zone.delivery_fee, public.get_setting_num('delivery_fee_base', 25));
  v_eta_min := coalesce(v_zone.eta_min_minutes, public.get_setting_num('delivery_eta_min_minutes', 30)::int);
  v_eta_max := coalesce(v_zone.eta_max_minutes, public.get_setting_num('delivery_eta_max_minutes', 60)::int);

  -- distance surcharge beyond the included distance (from the pickup point)
  if v_addr.lat is not null and (v_pp ->> 'lat') is not null then
    v_dist := public.haversine_km(v_addr.lat, v_addr.lng, (v_pp ->> 'lat')::double precision, (v_pp ->> 'lng')::double precision);
    if v_dist > public.get_setting_num('delivery_included_km', 3) then
      v_delivery := v_delivery + ceil(v_dist - public.get_setting_num('delivery_included_km', 3)) * public.get_setting_num('delivery_fee_per_extra_km', 8);
    end if;
  end if;

  if p_delivery_type = 'express' then
    v_express_fee := public.get_setting_num('express_delivery_fee', 20);
    v_eta_min := public.get_setting_num('express_eta_min_minutes', 20)::int;
    v_eta_max := public.get_setting_num('express_eta_max_minutes', 35)::int;
  end if;

  if v_sub >= v_threshold and v_sub > 0 then
    v_gap := 0; v_delivery_waived := v_delivery; v_delivery := 0;
  else
    v_gap := greatest(v_threshold - v_sub, 0);
  end if;

  v_platform := case when v_count > 0 then public.get_setting_num('platform_fee', 2) else 0 end;
  v_tax_rate := public.get_setting_num('tax_rate_percent', 18);
  v_tax := round((v_delivery + v_express_fee + v_platform) * v_tax_rate / 100, 2);

  if v_cart.coupon_id is not null then
    v_coupon := public.validate_coupon((select code from public.coupons where id = v_cart.coupon_id), v_sub, v_cats);
    if (v_coupon ->> 'valid')::boolean then v_coupon_disc := (v_coupon ->> 'discount')::numeric; end if;
  end if;

  v_total := greatest(v_sub - v_coupon_disc, 0) + v_delivery + v_express_fee + v_platform + v_tax;

  return jsonb_build_object(
    'cart_id', v_cart.id, 'empty', v_count = 0,
    'business_open', public.is_business_open(),
    'items', v_items, 'item_count', v_count, 'issues', v_issues,
    'subtotal', v_sub, 'mrp_total', v_mrp_total, 'item_savings', v_mrp_total - v_sub,
    'coupon', v_coupon, 'coupon_discount', v_coupon_disc,
    'delivery_fee', v_delivery, 'delivery_fee_waived', v_delivery_waived, 'express_fee', v_express_fee, 'platform_fee', v_platform, 'tax', v_tax, 'tax_rate', v_tax_rate,
    'total', v_total,
    'free_delivery_threshold', v_threshold, 'free_delivery_gap', v_gap, 'min_order_amount', v_min_order,
    'meets_min_order', v_sub >= v_min_order,
    'address', case when v_addr.id is null then null else to_jsonb(v_addr) end,
    'zone', case when v_zone.id is null then null else jsonb_build_object('id', v_zone.id, 'name', v_zone.name, 'express_supported', v_zone.express_supported) end,
    'serviceable', v_serviceable, 'service_message', v_msg,
    'eta_min_minutes', v_eta_min, 'eta_max_minutes', v_eta_max, 'distance_km', round(coalesce(v_dist,0)::numeric, 1),
    'delivery_type', p_delivery_type
  );
end $$;

create or replace function public.reorder(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_added int := 0; v_skipped jsonb := '[]'::jsonb; v_adjusted jsonb := '[]'::jsonb;
  v_res jsonb; v_qty int;
begin
  select * into o from public.orders where id = p_order_id and user_id = auth.uid();
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  for v_item in
    select oi.product_name, oi.quantity, i.id as inventory_id, i.stock_qty, i.is_active, i.max_order_qty
    from public.order_items oi
    left join public.inventory i on i.product_id = oi.product_id
    where oi.order_id = o.id
  loop
    if v_item.inventory_id is null or not v_item.is_active or v_item.stock_qty <= 0 then
      v_skipped := v_skipped || jsonb_build_object('name', v_item.product_name, 'reason', 'unavailable');
      continue;
    end if;
    v_qty := least(v_item.quantity, v_item.max_order_qty, v_item.stock_qty);
    begin
      v_res := public.add_to_cart(v_item.inventory_id, v_qty);
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('name', v_item.product_name, 'reason', 'unavailable');
      continue;
    end;
    if (v_res ->> 'ok')::boolean then
      v_added := v_added + 1;
      if v_qty < v_item.quantity then
        v_adjusted := v_adjusted || jsonb_build_object('name', v_item.product_name, 'requested', v_item.quantity, 'added', v_qty,
          'reason', case when v_item.stock_qty < least(v_item.quantity, v_item.max_order_qty) then 'stock' else 'limit' end);
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skipped, 'adjusted', v_adjusted);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Orders
-- ---------------------------------------------------------------------------
create or replace function public._set_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; v_title text; v_body text; v_brand text := coalesce(public.get_setting('brand_name') #>> '{}', 'Merta Deal');
begin
  select * into o from public.orders where id = p_order_id for update;
  update public.orders set
    status = p_status,
    confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
    ready_at = case when p_status = 'ready_for_pickup' then now() else ready_at end,
    picked_up_at = case when p_status = 'out_for_delivery' then now() else picked_up_at end,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    cancelled_at = case when p_status in ('cancelled','rejected') then now() else cancelled_at end
  where id = p_order_id;

  insert into public.order_status_history (order_id, status, actor_id, actor_role, note)
  values (p_order_id, p_status, auth.uid(), public.current_user_role(), p_note);

  v_title := case p_status
    when 'confirmed' then 'Order confirmed'
    when 'preparing' then 'Your order is being packed'
    when 'ready_for_pickup' then 'Order packed & ready'
    when 'rider_assigned' then 'Delivery partner assigned'
    when 'out_for_delivery' then 'Out for delivery'
    when 'delivered' then 'Order delivered'
    when 'completed' then 'Order completed'
    when 'cancelled' then 'Order cancelled'
    when 'rejected' then 'Order could not be fulfilled'
    else 'Order update' end;
  v_body := case p_status
    when 'confirmed' then format('Order %s is confirmed. %s will start packing shortly.', o.order_number, v_brand)
    when 'preparing' then format('%s is packing your order %s.', v_brand, o.order_number)
    when 'ready_for_pickup' then format('Order %s is packed. We are assigning a delivery partner.', o.order_number)
    when 'rider_assigned' then format('A delivery partner is on the way to pick up order %s.', o.order_number)
    when 'out_for_delivery' then format('Order %s is on its way. Share the OTP with the rider at delivery.', o.order_number)
    when 'delivered' then format('Order %s was delivered. Enjoy! Please rate your experience.', o.order_number)
    when 'completed' then format('Thank you for shopping with us. Order %s is complete.', o.order_number)
    when 'cancelled' then format('Order %s has been cancelled. %s', o.order_number, coalesce(p_note,''))
    when 'rejected' then format('We could not fulfil order %s. %s', o.order_number, coalesce(p_note,'Any payment made will be refunded.'))
    else o.order_number end;
  perform public.notify_user(o.user_id, 'order_status', v_title, v_body, jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'status', p_status));
end $$;

create or replace function public._auto_confirm_order(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'confirmed', confirmed_at = now() where id = p_order_id and status = 'placed';
  if not found then return false; end if;
  insert into public.order_status_history (order_id, status, actor_id, actor_role, note)
  values (p_order_id, 'confirmed', null, null, 'Confirmed automatically');
  return true;
end $$;

create or replace function public.place_order(
  p_address_id uuid,
  p_payment_method public.payment_method,
  p_delivery_type public.delivery_type default 'standard',
  p_instructions text default null,
  p_scheduled_start timestamptz default null,
  p_scheduled_end timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_cart public.carts; v_sum jsonb; v_addr public.addresses;
  v_order_id uuid; v_order_no text; v_total numeric; v_sub numeric;
  v_otp text; v_item record; v_zone_id uuid; v_pay_status public.payment_status; v_provider public.payment_provider;
  v_eta int; v_coupon_id uuid; v_coupon_code text; v_coupon_disc numeric; v_rider_earning numeric;
  v_wallet numeric; v_auto boolean; v_brand text := coalesce(public.get_setting('brand_name') #>> '{}', 'Merta Deal');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_payment_method not in ('cod','upi','card','netbanking','wallet','razorpay') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if p_payment_method = 'cod' and not public.get_setting_bool('cod_enabled', true) then raise exception 'COD_DISABLED'; end if;

  select * into v_cart from public.carts where user_id = v_uid and status = 'active' for update;
  if v_cart.id is null or not exists (select 1 from public.cart_items where cart_id = v_cart.id) then raise exception 'CART_EMPTY'; end if;

  select * into v_addr from public.addresses where id = p_address_id and user_id = v_uid;
  if v_addr.id is null then raise exception 'ADDRESS_NOT_FOUND'; end if;

  v_sum := public.cart_summary(p_address_id, p_delivery_type);
  if not (v_sum ->> 'serviceable')::boolean then raise exception 'NOT_SERVICEABLE: %', v_sum ->> 'service_message'; end if;
  if jsonb_array_length(v_sum -> 'issues') > 0 then raise exception 'ITEMS_UNAVAILABLE: %', (v_sum -> 'issues')::text; end if;
  if not (v_sum ->> 'meets_min_order')::boolean then raise exception 'MIN_ORDER: Minimum order amount is ₹%', v_sum ->> 'min_order_amount'; end if;
  if p_delivery_type = 'express' and not coalesce((v_sum #>> '{zone,express_supported}')::boolean, false) then raise exception 'EXPRESS_UNAVAILABLE'; end if;
  if p_delivery_type = 'scheduled' and (p_scheduled_start is null or p_scheduled_start < now()) then raise exception 'INVALID_SLOT'; end if;
  if not public.is_business_open() and p_delivery_type <> 'scheduled' then raise exception 'CLOSED: % is closed right now. Please order during business hours.', v_brand; end if;

  v_sub := (v_sum ->> 'subtotal')::numeric;
  v_total := (v_sum ->> 'total')::numeric;
  v_coupon_disc := (v_sum ->> 'coupon_discount')::numeric;
  v_coupon_id := case when v_coupon_disc > 0 then (v_sum #>> '{coupon,coupon_id}')::uuid end;
  v_coupon_code := case when v_coupon_disc > 0 then v_sum #>> '{coupon,code}' end;
  v_zone_id := (v_sum #>> '{zone,id}')::uuid;
  -- The promise is the delivery window the customer was shown at checkout.
  v_eta := (v_sum ->> 'eta_max_minutes')::int;
  v_rider_earning := public.get_setting_num('rider_base_earning', 20) + ceil((v_sum ->> 'distance_km')::numeric) * public.get_setting_num('rider_per_km_earning', 5);

  if p_payment_method = 'wallet' then
    select wallet_balance into v_wallet from public.profiles where id = v_uid for update;
    if v_wallet < v_total then raise exception 'INSUFFICIENT_WALLET'; end if;
  end if;

  v_pay_status := case when p_payment_method = 'cod' then 'cod_pending' when p_payment_method = 'wallet' then 'paid' else 'pending' end;
  v_provider := case when p_payment_method = 'cod' then 'cod' when p_payment_method = 'wallet' then 'wallet' else 'razorpay' end;
  v_order_no := public.generate_order_number();
  v_otp := public.secure_otp4();

  insert into public.orders (
    order_number, user_id, zone_id, status, delivery_type, scheduled_slot_start, scheduled_slot_end,
    address_snapshot, delivery_lat, delivery_lng, delivery_instructions, payment_method, payment_status,
    subtotal, item_discount, coupon_id, coupon_code, coupon_discount, delivery_fee, platform_fee, tax_amount, total,
    rider_earning, item_count, eta_minutes, promised_at
  ) values (
    v_order_no, v_uid, v_zone_id, 'placed', p_delivery_type, p_scheduled_start, p_scheduled_end,
    to_jsonb(v_addr) - 'user_id', v_addr.lat, v_addr.lng, p_instructions, p_payment_method, v_pay_status,
    v_sub, (v_sum ->> 'item_savings')::numeric, v_coupon_id, v_coupon_code, v_coupon_disc,
    (v_sum ->> 'delivery_fee')::numeric + (v_sum ->> 'express_fee')::numeric, (v_sum ->> 'platform_fee')::numeric, (v_sum ->> 'tax')::numeric, v_total,
    v_rider_earning, (v_sum ->> 'item_count')::int, v_eta,
    case when p_delivery_type = 'scheduled' then p_scheduled_end else now() + make_interval(mins => v_eta) end
  ) returning id into v_order_id;

  insert into public.order_secrets (order_id, delivery_otp) values (v_order_id, v_otp);

  for v_item in
    select ci.inventory_id, ci.product_id, ci.quantity, i.selling_price, i.mrp, p.name, p.pack_label, p.image_url, b.name as brand_name
    from public.cart_items ci join public.inventory i on i.id = ci.inventory_id join public.products p on p.id = ci.product_id
    left join public.brands b on b.id = p.brand_id
    where ci.cart_id = v_cart.id
  loop
    insert into public.order_items (order_id, product_id, inventory_id, product_name, brand_name, pack_label, image_url, quantity, unit_price, unit_mrp, line_total)
    values (v_order_id, v_item.product_id, v_item.inventory_id, v_item.name, v_item.brand_name, v_item.pack_label, v_item.image_url, v_item.quantity, v_item.selling_price, v_item.mrp, v_item.quantity * v_item.selling_price);
    update public.inventory set stock_qty = stock_qty - v_item.quantity, sold_count = sold_count + v_item.quantity where id = v_item.inventory_id;
    insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, -v_item.quantity, 'order', v_order_id, v_uid);
    update public.products set popularity_score = popularity_score + v_item.quantity where id = v_item.product_id;
  end loop;

  insert into public.payments (order_id, user_id, provider, method, amount, status)
  values (v_order_id, v_uid, v_provider, p_payment_method, v_total, v_pay_status);

  if p_payment_method = 'wallet' then
    update public.profiles set wallet_balance = wallet_balance - v_total where id = v_uid;
    insert into public.wallet_transactions (user_id, type, amount, balance_after, description, order_id)
    values (v_uid, 'debit', v_total, v_wallet - v_total, 'Paid for order ' || v_order_no, v_order_id);
  end if;

  if v_coupon_id is not null then
    insert into public.coupon_usage (coupon_id, user_id, order_id, discount_amount) values (v_coupon_id, v_uid, v_order_id, v_coupon_disc);
    update public.coupons set used_count = used_count + 1 where id = v_coupon_id;
  end if;

  update public.carts set status = 'converted' where id = v_cart.id;

  insert into public.order_status_history (order_id, status, actor_id, actor_role, note) values (v_order_id, 'placed', v_uid, 'customer', null);
  -- Quick commerce: a paid or cash-on-delivery order is confirmed at once and goes straight to packing.
  v_auto := public.get_setting_bool('auto_accept_orders', true) and v_pay_status in ('cod_pending', 'paid');
  if v_auto then perform public._auto_confirm_order(v_order_id); end if;
  perform public.notify_user(v_uid, 'order_placed', case when v_auto then 'Order confirmed' else 'Order placed' end,
    case when v_auto then format('Order %s is confirmed and being packed. Arriving in about %s minutes. Total ₹%s.', v_order_no, v_eta, to_char(v_total,'FM9999990.00'))
         else format('Order %s placed. Total ₹%s. We''ll confirm it as soon as your payment is received.', v_order_no, to_char(v_total,'FM9999990.00')) end,
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'status', case when v_auto then 'confirmed' else 'placed' end));
  perform public.notify_admins('new_order', 'New order ' || v_order_no,
    case when v_auto then format('%s items · ₹%s · %s. Pack it and tap "Packed" — a rider is requested automatically.', (v_sum ->> 'item_count'), to_char(v_total,'FM9999990.00'), upper(p_payment_method::text))
         else format('%s items · ₹%s · %s. Waiting for online payment; it is confirmed automatically once paid.', (v_sum ->> 'item_count'), to_char(v_total,'FM9999990.00'), upper(p_payment_method::text)) end,
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no));
  perform public.audit('order.place', 'orders', v_order_id::text, null, jsonb_build_object('order_number', v_order_no, 'total', v_total));

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'total', v_total,
    'payment_required', v_provider = 'razorpay', 'payment_method', p_payment_method);
end $$;

create or replace function public.confirm_online_payment(p_order_id uuid, p_provider_order_id text, p_provider_payment_id text, p_signature text, p_raw jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; v_auto boolean := false;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  update public.payments set status = 'paid', provider_order_id = p_provider_order_id, provider_payment_id = p_provider_payment_id,
    provider_signature = p_signature, raw_response = coalesce(p_raw, raw_response) where order_id = p_order_id;
  update public.orders set payment_status = 'paid' where id = p_order_id;
  if o.status = 'placed' and public.get_setting_bool('auto_accept_orders', true) then v_auto := public._auto_confirm_order(o.id); end if;
  perform public.notify_user(o.user_id, 'payment', case when v_auto then 'Payment received · order confirmed' else 'Payment received' end,
    format('₹%s received for order %s.%s', to_char(o.total,'FM9999990.00'), o.order_number, case when v_auto then ' It is being packed now.' else '' end), jsonb_build_object('order_id', o.id));
  perform public.notify_admins('payment_update', 'Payment confirmed for ' || o.order_number,
    case when v_auto then 'Online payment was successful. Pack the order and tap "Packed".' else 'Online payment was successful.' end, jsonb_build_object('order_id', o.id));
end $$;

-- Packing flow (replaces store_update_order): admins accept/reject (when auto-confirm is off or an online
-- payment is pending), mark packing, and tap "Packed" (ready) which requests a rider.
create or replace function public.fulfil_order(p_order_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_assignment uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;

  case p_action
    when 'accept' then
      if o.status <> 'placed' then raise exception 'INVALID_TRANSITION: % -> accept', o.status; end if;
      if o.payment_method not in ('cod') and o.payment_status not in ('paid','authorized') then raise exception 'PAYMENT_PENDING: Online payment has not been received yet'; end if;
      perform public._set_order_status(o.id, 'confirmed', p_note);
    when 'reject' then
      -- Allowed until the order is packed.
      if o.status not in ('placed','confirmed','preparing') then raise exception 'INVALID_TRANSITION: % -> reject', o.status; end if;
      for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
        update public.inventory set stock_qty = stock_qty + v_item.quantity, sold_count = greatest(sold_count - v_item.quantity, 0) where id = v_item.inventory_id;
        insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, v_item.quantity, 'reject_restock', o.id, auth.uid());
      end loop;
      update public.orders set reject_reason = p_note where id = o.id;
      perform public._handle_refund_on_cancel(o.id);
      perform public._set_order_status(o.id, 'rejected', p_note);
    when 'preparing' then
      if o.status <> 'confirmed' then raise exception 'INVALID_TRANSITION: % -> preparing', o.status; end if;
      perform public._set_order_status(o.id, 'preparing', p_note);
    when 'ready' then
      if o.status not in ('confirmed','preparing') then raise exception 'INVALID_TRANSITION: % -> ready', o.status; end if;
      perform public._set_order_status(o.id, 'ready_for_pickup', p_note);
      v_assignment := public.auto_dispatch(o.id);
    else raise exception 'UNKNOWN_ACTION';
  end case;
  return jsonb_build_object('ok', true, 'status', (select status from public.orders where id = o.id), 'assignment_id', v_assignment);
end $$;
revoke all on function public.fulfil_order(uuid, text, text) from public, anon;
grant execute on function public.fulfil_order(uuid, text, text) to authenticated;

create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_is_admin boolean := public.is_admin();
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if not (v_is_admin or o.user_id = auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if o.status in ('delivered','completed','cancelled','rejected') then raise exception 'CANNOT_CANCEL: %', o.status; end if;
  if not v_is_admin and o.status not in ('placed','confirmed') then raise exception 'CANNOT_CANCEL: order is already being packed. Please contact support.'; end if;

  for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
    update public.inventory set stock_qty = stock_qty + v_item.quantity, sold_count = greatest(sold_count - v_item.quantity, 0) where id = v_item.inventory_id;
    insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, v_item.quantity, 'cancel_restock', o.id, auth.uid());
  end loop;
  update public.delivery_assignments set status = 'cancelled' where order_id = o.id and status in ('offered','accepted','picked_up');
  update public.orders set cancelled_by = auth.uid(), cancel_reason = p_reason where id = o.id;
  perform public._handle_refund_on_cancel(o.id);
  perform public._set_order_status(o.id, 'cancelled', p_reason);
  if not v_is_admin then
    perform public.notify_admins('order_cancelled', 'Order ' || o.order_number || ' cancelled', coalesce(p_reason, 'Cancelled by customer.'), jsonb_build_object('order_id', o.id));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.order_tracking(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; v_uid uuid := auth.uid(); v_is_customer boolean; v_is_rider boolean; v_admin boolean; a record; r jsonb; v_pp jsonb := public.pickup_point();
begin
  select * into o from public.orders where id = p_order_id;
  if o.id is null then return null; end if;
  v_admin := public.is_admin();
  v_is_customer := o.user_id = v_uid;
  select a1.*, dp.user_id as rider_user_id, dp.vehicle_type, dp.vehicle_number, dp.rating_avg as rider_rating, dp.current_lat, dp.current_lng, dp.last_location_at,
         pr.full_name as rider_name, pr.phone as rider_phone, pr.avatar_url as rider_avatar
  into a
  from public.delivery_assignments a1
  join public.delivery_partners dp on dp.id = a1.rider_id
  join public.profiles pr on pr.id = dp.user_id
  where a1.order_id = o.id and a1.status in ('offered','accepted','picked_up','delivered')
  order by a1.created_at desc limit 1;
  v_is_rider := a.rider_user_id = v_uid;
  if not (v_admin or v_is_customer or v_is_rider) then raise exception 'FORBIDDEN'; end if;

  r := jsonb_build_object(
    'order', to_jsonb(o),
    'items', (select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'created_at', h.created_at, 'actor_role', h.actor_role) order by h.created_at), '[]'::jsonb) from public.order_status_history h where h.order_id = o.id),
    'pickup', jsonb_build_object('name', coalesce(v_pp ->> 'name', 'Merta Deal'), 'phone', v_pp ->> 'phone', 'address_line1', v_pp ->> 'address_line1', 'area', v_pp ->> 'area',
                                 'lat', (v_pp ->> 'lat')::double precision, 'lng', (v_pp ->> 'lng')::double precision),
    'payment', (select jsonb_build_object('provider', p.provider, 'method', p.method, 'status', p.status, 'amount', p.amount, 'provider_order_id', p.provider_order_id, 'refund_required', p.refund_required) from public.payments p where p.order_id = o.id order by p.created_at desc limit 1),
    'assignment', case when a.id is null then null else jsonb_build_object(
        'id', a.id, 'status', a.status, 'accepted_at', a.responded_at, 'picked_up_at', a.picked_up_at, 'delivered_at', a.delivered_at, 'distance_km', a.distance_km,
        'earning', case when v_is_rider or v_admin then a.earning end, 'cod_amount', a.cod_amount, 'expires_at', a.expires_at,
        'rider', jsonb_build_object('name', a.rider_name, 'phone', a.rider_phone, 'avatar_url', a.rider_avatar,
                                    'vehicle_type', a.vehicle_type, 'vehicle_number', a.vehicle_number, 'rating_avg', a.rider_rating),
        'last_location', case when a.status in ('accepted','picked_up') then (
          select jsonb_build_object('lat', l.lat, 'lng', l.lng, 'heading', l.heading, 'speed_mps', l.speed_mps, 'accuracy_m', l.accuracy_m, 'recorded_at', l.recorded_at)
          from public.delivery_locations l where l.assignment_id = a.id order by l.recorded_at desc limit 1) end
      ) end,
    'customer', case when v_is_rider or v_admin then jsonb_build_object('name', o.address_snapshot ->> 'full_name', 'phone', o.address_snapshot ->> 'phone') else null end,
    'delivery_otp', case when v_is_customer and o.status = 'out_for_delivery' then (select delivery_otp from public.order_secrets where order_id = o.id) end,
    'otp_locked', case when v_is_customer or v_admin then (select otp_attempts >= public.get_setting_num('otp_max_attempts', 5)::int from public.order_secrets where order_id = o.id) end,
    'can_review', v_is_customer and o.status in ('delivered','completed'),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('target', rv.target, 'product_id', rv.product_id, 'rating', rv.rating, 'status', rv.status)), '[]'::jsonb) from public.reviews rv where rv.order_id = o.id and rv.user_id = v_uid),
    'viewer', case when v_admin then 'admin' when v_is_customer then 'customer' else 'rider' end
  );
  return r;
end $$;

create or replace function public.track_order_by_code(p_code text, p_phone text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; v_phone text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g'); v_pp jsonb := public.pickup_point();
begin
  if length(v_phone) < 10 then return null; end if;
  v_phone := right(v_phone, 10);
  select * into o from public.orders
  where (upper(order_number) = upper(trim(p_code)) or upper(short_code) = upper(trim(p_code)))
    and right(regexp_replace(coalesce(address_snapshot ->> 'phone',''), '\D', '', 'g'), 10) = v_phone
  limit 1;
  if o.id is null then return null; end if;
  return jsonb_build_object(
    'order', jsonb_build_object('id', o.id, 'order_number', o.order_number, 'short_code', o.short_code, 'status', o.status, 'total', o.total, 'item_count', o.item_count,
      'payment_method', o.payment_method, 'payment_status', o.payment_status, 'promised_at', o.promised_at, 'created_at', o.created_at, 'delivered_at', o.delivered_at),
    'pickup', jsonb_build_object('name', coalesce(v_pp ->> 'name', 'Merta Deal'), 'area', v_pp ->> 'area', 'phone', v_pp ->> 'phone'),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity, 'pack_label', oi.pack_label, 'line_total', oi.line_total)), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'created_at', h.created_at, 'actor_role', h.actor_role) order by h.created_at), '[]'::jsonb) from public.order_status_history h where h.order_id = o.id),
    'delivery_otp', case when o.status = 'out_for_delivery' then (select delivery_otp from public.order_secrets where order_id = o.id) end,
    'rider', (select jsonb_build_object('name', pr.full_name, 'vehicle_number', dp.vehicle_number) from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id join public.profiles pr on pr.id = dp.user_id where a.order_id = o.id and a.status in ('accepted','picked_up','delivered') order by a.created_at desc limit 1)
  );
end $$;

create or replace function public.submit_review(p_order_id uuid, p_target public.review_target, p_rating int, p_comment text default null, p_product_id uuid default null, p_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; v_id uuid; v_rider uuid;
begin
  select * into o from public.orders where id = p_order_id and user_id = auth.uid();
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status not in ('delivered','completed') then raise exception 'ORDER_NOT_DELIVERED'; end if;
  if p_target = 'product' and not exists (select 1 from public.order_items where order_id = o.id and product_id = p_product_id) then raise exception 'PRODUCT_NOT_IN_ORDER'; end if;
  if p_target = 'delivery' then
    select rider_id into v_rider from public.delivery_assignments where order_id = o.id and status = 'delivered' limit 1;
    if v_rider is null then raise exception 'NO_DELIVERY_TO_RATE'; end if;
  end if;
  insert into public.reviews (user_id, order_id, target, product_id, rider_id, rating, title, comment)
  values (auth.uid(), o.id, p_target, case when p_target = 'product' then p_product_id end, case when p_target = 'delivery' then v_rider end,
          p_rating, p_title, p_comment)
  on conflict (order_id, target, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set rating = excluded.rating, comment = excluded.comment, title = excluded.title, status = 'pending', updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.reviews_recompute_ratings()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.reviews;
begin
  r := coalesce(new, old);
  if r.target = 'product' and r.product_id is not null then
    update public.products p set rating_avg = coalesce(s.avg,0), rating_count = coalesce(s.cnt,0)
    from (select round(avg(rating)::numeric,2) avg, count(*) cnt from public.reviews where product_id = r.product_id and status = 'approved') s
    where p.id = r.product_id;
  elsif r.target = 'delivery' and r.rider_id is not null then
    update public.delivery_partners dp set rating_avg = coalesce(s.avg,0), rating_count = coalesce(s.cnt,0)
    from (select round(avg(rating)::numeric,2) avg, count(*) cnt from public.reviews where rider_id = r.rider_id and status = 'approved') s
    where dp.id = r.rider_id;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Dispatch and delivery
-- ---------------------------------------------------------------------------
create or replace function public.auto_dispatch(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; r record; v_id uuid; v_dist numeric; v_pp jsonb := public.pickup_point();
  v_lat double precision := (v_pp ->> 'lat')::double precision; v_lng double precision := (v_pp ->> 'lng')::double precision; v_city uuid := (v_pp ->> 'city_id')::uuid;
begin
  -- Lock the order so two concurrent sweeps can't both offer it.
  select * into o from public.orders where id = p_order_id for update;
  if o.status not in ('ready_for_pickup') then return null; end if;
  -- Close timed-out offers first, so a missed offer doesn't block the order forever.
  update public.delivery_assignments set status = 'expired' where status = 'offered' and expires_at < now();
  if exists (select 1 from public.delivery_assignments where order_id = o.id and status in ('offered','accepted','picked_up')) then return null; end if;

  select dp.*, public.haversine_km(dp.current_lat, dp.current_lng, v_lat, v_lng) as dist into r
  from public.delivery_partners dp
  where dp.status = 'active' and dp.is_online
    and dp.current_lat is not null
    and (dp.city_id is null or v_city is null or dp.city_id = v_city)
    and public.haversine_km(dp.current_lat, dp.current_lng, v_lat, v_lng) <= public.get_setting_num('dispatch_radius_km', 8)
    and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.status in ('offered','accepted','picked_up'))
    -- Only a rider who declined this order is skipped; one who simply missed the offer gets it again.
    and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.order_id = o.id and a.status = 'rejected')
  order by dist asc, dp.rating_avg desc
  limit 1;

  if r.id is null then
    perform public.audit('dispatch.no_rider', 'orders', o.id::text, null, jsonb_build_object('order_number', o.order_number));
    return null;
  end if;

  v_dist := coalesce(public.haversine_km(v_lat, v_lng, o.delivery_lat, o.delivery_lng), 0);
  insert into public.delivery_assignments (order_id, rider_id, status, expires_at, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, earning, cod_amount)
  values (o.id, r.id, 'offered', now() + make_interval(secs => public.get_setting_num('dispatch_offer_timeout_seconds', 180)),
          v_lat, v_lng, o.delivery_lat, o.delivery_lng, round(v_dist::numeric, 2), o.rider_earning,
          case when o.payment_method = 'cod' then o.total else 0 end)
  returning id into v_id;

  perform public.notify_user(r.user_id, 'delivery_offer', 'New delivery request',
    format('Pickup from %s · %s km · Earn ₹%s', coalesce(v_pp ->> 'name', 'Merta Deal'), round(v_dist::numeric,1), to_char(o.rider_earning,'FM9999990')),
    jsonb_build_object('assignment_id', v_id, 'order_id', o.id, 'order_number', o.order_number));
  return v_id;
end $$;

create or replace function public.admin_assign_rider(p_order_id uuid, p_rider_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; dp public.delivery_partners; v_id uuid; v_dist numeric; v_pp jsonb := public.pickup_point();
  v_lat double precision := (v_pp ->> 'lat')::double precision; v_lng double precision := (v_pp ->> 'lng')::double precision;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.status not in ('ready_for_pickup','preparing','confirmed') then raise exception 'INVALID_STATE: %', o.status; end if;
  select * into dp from public.delivery_partners where id = p_rider_id and status = 'active';
  if dp.id is null then raise exception 'RIDER_NOT_FOUND'; end if;
  update public.delivery_assignments set status = 'cancelled' where order_id = o.id and status = 'offered';
  v_dist := coalesce(public.haversine_km(v_lat, v_lng, o.delivery_lat, o.delivery_lng), 0);
  insert into public.delivery_assignments (order_id, rider_id, status, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, earning, cod_amount, note)
  values (o.id, dp.id, 'offered', v_lat, v_lng, o.delivery_lat, o.delivery_lng, round(v_dist::numeric,2), o.rider_earning,
          case when o.payment_method = 'cod' then o.total else 0 end, 'Assigned by admin')
  returning id into v_id;
  perform public.notify_user(dp.user_id, 'delivery_offer', 'New delivery request (admin)', format('Pickup from %s · Earn ₹%s', coalesce(v_pp ->> 'name', 'Merta Deal'), to_char(o.rider_earning,'FM9999990')),
    jsonb_build_object('assignment_id', v_id, 'order_id', o.id, 'order_number', o.order_number));
  perform public.audit('dispatch.manual_assign', 'orders', o.id::text, null, jsonb_build_object('rider_id', dp.id));
  return v_id;
end $$;

create or replace function public.rider_respond_assignment(p_assignment_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; dp public.delivery_partners; o public.orders; v_next uuid;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  if a.status <> 'offered' then raise exception 'INVALID_STATE: %', a.status; end if;
  if a.expires_at < now() then
    update public.delivery_assignments set status = 'expired', responded_at = now() where id = a.id;
    raise exception 'OFFER_EXPIRED';
  end if;
  select * into o from public.orders where id = a.order_id for update;
  if p_accept then
    if exists (select 1 from public.delivery_assignments where rider_id = dp.id and status in ('accepted','picked_up')) then raise exception 'ALREADY_ON_DELIVERY'; end if;
    update public.delivery_assignments set status = 'accepted', responded_at = now() where id = a.id;
    perform public._set_order_status(o.id, 'rider_assigned', null);
    perform public.notify_admins('rider_assigned', 'Rider assigned for ' || o.order_number, 'A delivery partner is on the way to pick it up.', jsonb_build_object('order_id', o.id));
    return jsonb_build_object('ok', true, 'status', 'accepted');
  else
    update public.delivery_assignments set status = 'rejected', responded_at = now() where id = a.id;
    v_next := public.auto_dispatch(o.id);
    return jsonb_build_object('ok', true, 'status', 'rejected', 'reassigned_to', v_next);
  end if;
end $$;

create or replace function public.rider_assignments(p_status text[] default array['offered','accepted','picked_up'])
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners; v_pp jsonb := public.pickup_point();
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  update public.delivery_assignments set status = 'expired' where rider_id = dp.id and status = 'offered' and expires_at < now();
  -- An active rider who is online picks up any packed order still waiting for a rider.
  if dp.status = 'active' and dp.is_online then perform public.dispatch_pending(); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'status', a.status, 'offered_at', a.offered_at, 'expires_at', a.expires_at, 'responded_at', a.responded_at,
      'picked_up_at', a.picked_up_at, 'delivered_at', a.delivered_at, 'distance_km', a.distance_km, 'earning', a.earning, 'cod_amount', a.cod_amount,
      'pickup_lat', a.pickup_lat, 'pickup_lng', a.pickup_lng,
      'drop_lat', case when x.live then a.drop_lat else round(a.drop_lat::numeric, 3)::double precision end,
      'drop_lng', case when x.live then a.drop_lng else round(a.drop_lng::numeric, 3)::double precision end,
      'order', jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'total', o.total, 'item_count', o.item_count,
        'payment_method', o.payment_method,
        'delivery_instructions', case when x.live then o.delivery_instructions end,
        'address', case when x.live then o.address_snapshot
                        else jsonb_strip_nulls(jsonb_build_object('area', o.address_snapshot ->> 'area', 'city', o.address_snapshot ->> 'city', 'pincode', o.address_snapshot ->> 'pincode')) end,
        'promised_at', o.promised_at, 'created_at', o.created_at),
      'pickup', jsonb_build_object('name', coalesce(v_pp ->> 'name', 'Merta Deal'), 'phone', v_pp ->> 'phone', 'address_line1', v_pp ->> 'address_line1', 'area', v_pp ->> 'area',
                                   'lat', a.pickup_lat, 'lng', a.pickup_lng),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity, 'pack_label', oi.pack_label)), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id)
    ) order by a.created_at desc), '[]'::jsonb)
    from public.delivery_assignments a
    cross join lateral (select a.status in ('accepted','picked_up') as live) x
    join public.orders o on o.id = a.order_id
    where a.rider_id = dp.id and a.status::text = any(p_status));
end $$;

create or replace function public._complete_delivery(p_assignment_id uuid, p_via text)
returns int language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; o public.orders; v_points int := 0; v_new uuid;
begin
  select * into a from public.delivery_assignments where id = p_assignment_id;
  select * into o from public.orders where id = a.order_id;
  update public.delivery_assignments set status = 'delivered', delivered_at = now() where id = a.id;
  perform public._set_order_status(o.id, 'delivered', case when p_via = 'support' then 'Confirmed by support without OTP' end);

  if o.payment_method = 'cod' then
    update public.payments set status = 'cod_collected', collected_by = (select user_id from public.delivery_partners where id = a.rider_id), collected_at = now() where order_id = o.id;
    update public.orders set payment_status = 'cod_collected' where id = o.id;
  end if;

  insert into public.rider_earnings (rider_id, assignment_id, order_id, amount, confirmed_via)
  values (a.rider_id, a.id, o.id, a.earning, p_via)
  on conflict (assignment_id) do nothing
  returning id into v_new;
  if v_new is not null then
    update public.delivery_partners set total_deliveries = total_deliveries + 1, total_earnings = total_earnings + a.earning where id = a.rider_id;
    v_points := floor(o.subtotal / 100) * public.get_setting_num('reward_points_per_100', 1)::int;
    if v_points > 0 then
      update public.profiles set reward_points = reward_points + v_points where id = o.user_id;
      insert into public.reward_transactions (user_id, points, reason, order_id) values (o.user_id, v_points, 'Order ' || o.order_number, o.id);
    end if;
    perform public.notify_admins('order_delivered', 'Order ' || o.order_number || ' delivered', 'Delivered successfully by the rider.', jsonb_build_object('order_id', o.id));
  end if;
  return v_points;
end $$;

create or replace function public.rider_report_failed_delivery(p_assignment_id uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners; a public.delivery_assignments; o public.orders; v_label text; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  if a.status not in ('accepted', 'picked_up') then raise exception 'INVALID_STATE: %', a.status; end if;
  v_label := case p_reason
    when 'customer_unreachable' then 'Customer not reachable'
    when 'address_problem' then 'Address wrong or not found'
    when 'customer_refused' then 'Customer refused the order'
    when 'other' then 'Other'
    else null end;
  if v_label is null then raise exception 'INVALID_REASON'; end if;
  if p_reason = 'other' and (v_note is null or length(v_note) < 5) then raise exception 'REASON_REQUIRED'; end if;
  if v_note is not null and length(v_note) > 300 then v_note := left(v_note, 300); end if;

  select * into o from public.orders where id = a.order_id for update;
  update public.delivery_assignments set status = 'cancelled', failure_reason = v_label || coalesce(': ' || v_note, ''), failed_at = now() where id = a.id;
  if o.status in ('rider_assigned', 'out_for_delivery') then
    perform public._set_order_status(o.id, 'ready_for_pickup', 'Delivery attempt failed — ' || v_label || coalesce(': ' || v_note, '') || '. Returned for re-dispatch.');
  end if;

  perform public.notify_user(o.user_id, 'delivery_failed', 'We couldn''t deliver order ' || o.order_number,
    format('Our delivery partner couldn''t complete the handover (%s). We''ll contact you to arrange delivery again.', lower(v_label)), jsonb_build_object('order_id', o.id));
  perform public.notify_admins('delivery_failed', 'Delivery failed: ' || o.order_number,
    format('%s%s. The rider is bringing the order back. Re-dispatch a rider or cancel the order.', v_label, coalesce(' — ' || v_note, '')), jsonb_build_object('order_id', o.id));
  perform public.audit('delivery.failed', 'orders', o.id::text, null, jsonb_build_object('assignment_id', a.id, 'rider_id', dp.id, 'reason', p_reason, 'note', v_note));
  return jsonb_build_object('ok', true, 'order_status', (select status from public.orders where id = o.id));
end $$;

-- ---------------------------------------------------------------------------
-- 11. Admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_live_riders()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', dp.id, 'user_id', dp.user_id, 'name', pr.full_name, 'phone', pr.phone, 'avatar_url', pr.avatar_url,
      'vehicle_type', dp.vehicle_type, 'vehicle_number', dp.vehicle_number, 'rating_avg', dp.rating_avg,
      'lat', dp.current_lat, 'lng', dp.current_lng, 'last_location_at', dp.last_location_at,
      'busy', exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.status in ('accepted','picked_up')),
      'current_order', (select jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', a.status)
                        from public.delivery_assignments a join public.orders o on o.id = a.order_id
                        where a.rider_id = dp.id and a.status in ('accepted','picked_up') order by a.created_at desc limit 1)
    ) order by dp.last_location_at desc nulls last), '[]'::jsonb)
    from public.delivery_partners dp join public.profiles pr on pr.id = dp.user_id
    where dp.status = 'active' and dp.is_online);
end $$;

create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'total_orders', (select count(*) from public.orders),
    'today_orders', (select count(*) from public.orders where (created_at at time zone 'Asia/Kolkata')::date = v_today),
    'gmv', (select coalesce(sum(total),0) from public.orders where status not in ('cancelled','rejected')),
    'today_gmv', (select coalesce(sum(total),0) from public.orders where status not in ('cancelled','rejected') and (created_at at time zone 'Asia/Kolkata')::date = v_today),
    -- Sales kept after paying riders (delivered orders).
    'revenue', (select coalesce(sum(total - rider_earning),0) from public.orders where status in ('delivered','completed')),
    'customers', (select count(*) from public.profiles where role = 'customer'),
    'riders', (select count(*) from public.delivery_partners where status = 'active'),
    'online_riders', (select count(*) from public.delivery_partners where status = 'active' and is_online),
    'to_pack', (select count(*) from public.orders where status in ('placed','confirmed','preparing')),
    'pending_orders', (select count(*) from public.orders where status in ('placed','confirmed','preparing','ready_for_pickup','rider_assigned','out_for_delivery')),
    'cancelled_orders', (select count(*) from public.orders where status in ('cancelled','rejected')),
    'avg_delivery_minutes', (select round(avg(extract(epoch from (delivered_at - created_at))/60)) from public.orders where delivered_at is not null),
    'on_time_pct', (select round(100.0 * count(*) filter (where delivered_at <= promised_at) / nullif(count(*),0)) from public.orders where delivered_at is not null and promised_at is not null),
    'pending_reviews', (select count(*) from public.reviews where status = 'pending'),
    'open_tickets', (select count(*) from public.support_tickets where status in ('open','in_progress')),
    'refunds_pending', (select count(*) from public.payments where refund_required and status <> 'refunded'),
    'low_stock', (select count(*) from public.inventory where is_active and status in ('low_stock','out_of_stock')),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', c, 'gmv', g) order by d), '[]'::jsonb) from (
        select (created_at at time zone 'Asia/Kolkata')::date d, count(*) c, coalesce(sum(total),0) g from public.orders
        where created_at > now() - interval '14 days' and status not in ('cancelled','rejected') group by 1) w),
    'status_breakdown', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select status, count(*) c from public.orders group by status) s)
  );
end $$;

create or replace function public.admin_report(p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz; v_to timestamptz;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'INVALID_RANGE: End date must be after start date'; end if;
  v_from := (p_start::timestamp at time zone 'Asia/Kolkata');
  v_to := ((p_end + 1)::timestamp at time zone 'Asia/Kolkata');
  return jsonb_build_object(
    'range', jsonb_build_object('start', p_start, 'end', p_end),
    'orders', (select count(*) from public.orders where created_at >= v_from and created_at < v_to),
    'delivered', (select count(*) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'cancelled', (select count(*) from public.orders where created_at >= v_from and created_at < v_to and status in ('cancelled','rejected')),
    'gmv', (select coalesce(sum(total),0) from public.orders where created_at >= v_from and created_at < v_to and status not in ('cancelled','rejected')),
    'item_sales', (select coalesce(sum(subtotal - coupon_discount),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'delivery_fees', (select coalesce(sum(delivery_fee),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'platform_fees', (select coalesce(sum(platform_fee),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'taxes', (select coalesce(sum(tax_amount),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'rider_earnings', (select coalesce(sum(rider_earning),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'coupon_discounts', (select coalesce(sum(coupon_discount),0) from public.orders where created_at >= v_from and created_at < v_to and status not in ('cancelled','rejected')),
    'net_revenue', (select coalesce(sum(total - rider_earning),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'avg_order_value', (select round(coalesce(avg(total),0), 2) from public.orders where created_at >= v_from and created_at < v_to and status not in ('cancelled','rejected')),
    'avg_delivery_minutes', (select round(avg(extract(epoch from (delivered_at - created_at))/60)) from public.orders where created_at >= v_from and created_at < v_to and delivered_at is not null),
    'new_customers', (select count(*) from public.profiles where role = 'customer' and created_at >= v_from and created_at < v_to),
    'payment_methods', (select coalesce(jsonb_object_agg(payment_method, c), '{}'::jsonb) from (select payment_method, count(*) c from public.orders where created_at >= v_from and created_at < v_to and status not in ('cancelled','rejected') group by 1) pm),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', c, 'gmv', g, 'cancelled', x) order by d), '[]'::jsonb) from (
        select (created_at at time zone 'Asia/Kolkata')::date d, count(*) filter (where status not in ('cancelled','rejected')) c, coalesce(sum(total) filter (where status not in ('cancelled','rejected')),0) g, count(*) filter (where status in ('cancelled','rejected')) x
        from public.orders where created_at >= v_from and created_at < v_to group by 1) w),
    'top_products', (select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'name', name, 'quantity', q, 'revenue', r, 'orders', oc) order by r desc), '[]'::jsonb) from (
        select oi.product_id, max(oi.product_name) name, sum(oi.quantity) q, coalesce(sum(oi.line_total),0) r, count(distinct oi.order_id) oc
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where o.created_at >= v_from and o.created_at < v_to and o.status not in ('cancelled','rejected')
        group by oi.product_id order by r desc limit 15) tp),
    'top_categories', (select coalesce(jsonb_agg(jsonb_build_object('category_id', category_id, 'name', name, 'quantity', q, 'revenue', r) order by r desc), '[]'::jsonb) from (
        select c.id category_id, max(c.name) name, sum(oi.quantity) q, coalesce(sum(oi.line_total),0) r
        from public.order_items oi join public.orders o on o.id = oi.order_id join public.products p on p.id = oi.product_id join public.categories c on c.id = coalesce((select parent_id from public.categories pc where pc.id = p.category_id), p.category_id)
        where o.created_at >= v_from and o.created_at < v_to and o.status not in ('cancelled','rejected')
        group by c.id order by r desc limit 10) tc),
    'riders', (select coalesce(jsonb_agg(jsonb_build_object('rider_id', rider_id, 'name', name, 'deliveries', c, 'earnings', e, 'avg_minutes', m, 'distance_km', dk, 'rating', rt) order by c desc), '[]'::jsonb) from (
        select a.rider_id, max(pr.full_name) name, count(*) c, coalesce(sum(a.earning),0) e,
               round(avg(extract(epoch from (a.delivered_at - coalesce(a.responded_at, a.offered_at)))/60)) m, coalesce(sum(a.distance_km),0) dk, max(dp.rating_avg) rt
        from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id join public.profiles pr on pr.id = dp.user_id
        where a.status = 'delivered' and a.delivered_at >= v_from and a.delivered_at < v_to
        group by a.rider_id order by c desc limit 20) rd)
  );
end $$;

create or replace function public.admin_broadcast_notification(p_audience text, p_title text, p_body text, p_user_email text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; v_uid uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then raise exception 'INVALID_INPUT: Title and message are required'; end if;
  if p_audience = 'user' then
    if coalesce(trim(p_user_email), '') = '' then raise exception 'EMAIL_REQUIRED: Enter the user''s email'; end if;
    select id into v_uid from public.profiles where lower(email) = lower(trim(p_user_email)) limit 1;
    if v_uid is null then select id into v_uid from auth.users where lower(email) = lower(trim(p_user_email)) limit 1; end if;
    if v_uid is null then raise exception 'USER_NOT_FOUND: No account with that email'; end if;
    insert into public.notifications (user_id, type, title, body, data, channels)
    values (v_uid, 'broadcast', trim(p_title), trim(p_body), jsonb_build_object('audience', 'user'), '{in_app,push}');
    n := 1;
  elsif p_audience in ('customers', 'riders', 'all') then
    insert into public.notifications (user_id, type, title, body, data, channels)
    select p.id, 'broadcast', trim(p_title), trim(p_body), jsonb_build_object('audience', p_audience), '{in_app,push}'
    from public.profiles p
    where p.is_active
      and (p_audience = 'all'
        or (p_audience = 'customers' and p.role = 'customer' and not coalesce(p.is_guest, false))
        or (p_audience = 'riders' and p.role = 'rider'));
    get diagnostics n = row_count;
  else
    raise exception 'INVALID_AUDIENCE';
  end if;
  perform public.audit('notification.broadcast', 'notifications', null, null, jsonb_build_object('audience', p_audience, 'title', trim(p_title), 'recipients', n, 'email', p_user_email));
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 12. Policies
-- ---------------------------------------------------------------------------
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select using (is_active or public.is_admin());
drop policy if exists products_read on public.products;
create policy products_read on public.products for select using (is_active or public.is_admin());
drop policy if exists inventory_read on public.inventory;
create policy inventory_read on public.inventory for select using (is_active or public.is_admin());
drop policy if exists inventory_admin_write on public.inventory;
create policy inventory_admin_write on public.inventory for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists inventory_movements_read on public.inventory_movements;
create policy inventory_movements_read on public.inventory_movements for select using (public.is_admin());
drop policy if exists coupons_read on public.coupons;
create policy coupons_read on public.coupons for select using ((is_active and (expires_at is null or expires_at > now())) or public.is_admin());
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select using (user_id = auth.uid() or public.is_admin() or public.is_assigned_rider(id));
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select using (status = 'approved' or user_id = auth.uid() or public.is_admin());
