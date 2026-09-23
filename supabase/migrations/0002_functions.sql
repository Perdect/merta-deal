-- ============================================================================
-- MERTA DEAL — Business logic (RBAC helpers, cart, coupons, orders, delivery,
-- search, dashboards). All privileged functions are SECURITY DEFINER with
-- explicit role checks; RLS guards direct table access (see 0003_rls.sql).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RBAC helpers
-- ----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','super_admin') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.my_store_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.stores where owner_id = auth.uid()
  union
  select store_id from public.store_staff where user_id = auth.uid() and is_active;
$$;

create or replace function public.is_store_member(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.my_store_ids() s where s = p_store_id);
$$;

create or replace function public.my_rider_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.delivery_partners where user_id = auth.uid();
$$;

create or replace function public.is_rider()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.delivery_partners where user_id = auth.uid());
$$;

-- ----------------------------------------------------------------------------
-- Settings accessors (business rules live in the settings table, never in code)
-- ----------------------------------------------------------------------------
create or replace function public.get_setting(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.settings where key = p_key;
$$;

create or replace function public.get_setting_num(p_key text, p_default numeric default 0)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from public.settings where key = p_key and jsonb_typeof(value) in ('number','string')), p_default);
$$;

create or replace function public.get_setting_bool(p_key text, p_default boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from public.settings where key = p_key), p_default);
$$;

create or replace function public.public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.settings where is_public;
$$;

-- ----------------------------------------------------------------------------
-- Profile bootstrap from auth.users
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role := 'customer';
  v_requested text := new.raw_user_meta_data ->> 'role';
begin
  -- Self-signup may only request customer / store_owner / rider. Admin roles are granted by admins.
  if v_requested in ('store_owner','rider') then
    v_role := v_requested::public.user_role;
  end if;

  insert into public.profiles (id, role, full_name, phone, email, referral_code, city_id)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email,''), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone),
    new.email,
    upper(substr(md5(new.id::text), 1, 8)),
    (select id from public.cities where slug = 'merta-city')
  )
  on conflict (id) do nothing;

  if v_role = 'rider' then
    insert into public.delivery_partners (user_id, city_id, vehicle_type, vehicle_number)
    values (new.id, (select id from public.cities where slug = 'merta-city'),
            coalesce((new.raw_user_meta_data ->> 'vehicle_type')::public.vehicle_type, 'bike'),
            new.raw_user_meta_data ->> 'vehicle_number')
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Notifications helpers
-- ----------------------------------------------------------------------------
create or replace function public.notify_user(p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then return; end if;
  insert into public.notifications (user_id, type, title, body, data, channels)
  values (p_user_id, p_type, p_title, p_body, coalesce(p_data,'{}'::jsonb), '{in_app,push}');
end $$;

create or replace function public.notify_store(p_store_id uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select owner_id as user_id from public.stores where id = p_store_id
    union
    select user_id from public.store_staff where store_id = p_store_id and is_active
  loop
    perform public.notify_user(r.user_id, p_type, p_title, p_body, p_data);
  end loop;
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.notifications set is_read = true
  where user_id = auth.uid() and is_read = false and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

-- ----------------------------------------------------------------------------
-- Audit helper
-- ----------------------------------------------------------------------------
create or replace function public.audit(p_action text, p_entity text, p_entity_id text, p_before jsonb default null, p_after jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, before_data, after_data)
  values (auth.uid(), public.current_user_role(), p_action, p_entity, p_entity_id, p_before, p_after);
end $$;

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, before_data, after_data)
  values (
    auth.uid(), public.current_user_role(),
    lower(tg_op), tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'key'),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  for t in select unnest(array['settings','stores','coupons','delivery_zones','categories','delivery_partners','payouts','banners']) loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row_change()', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Inventory status sync + low stock alerts
-- ----------------------------------------------------------------------------
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
    perform public.notify_store(new.store_id, 'low_stock',
      case when v_new = 'out_of_stock' then 'Out of stock: ' || v_name else 'Low stock: ' || v_name end,
      format('%s has %s units left. Update stock to keep receiving orders.', v_name, new.stock_qty),
      jsonb_build_object('inventory_id', new.id, 'product_id', new.product_id, 'stock_qty', new.stock_qty));
  end if;
  return new;
end $$;
create trigger inventory_sync_status_trg before insert or update of stock_qty, low_stock_threshold on public.inventory
for each row execute function public.inventory_sync_status();

-- ----------------------------------------------------------------------------
-- Order number
-- ----------------------------------------------------------------------------
create or replace function public.generate_order_number()
returns text language sql volatile as $$
  select 'MD' || to_char(now() at time zone 'Asia/Kolkata', 'YYMM') || lpad(nextval('public.order_number_seq')::text, 6, '0');
$$;

-- ----------------------------------------------------------------------------
-- Serviceability (delivery zones)
-- ----------------------------------------------------------------------------
create or replace function public.find_zone(p_pincode text default null, p_lat double precision default null, p_lng double precision default null)
returns public.delivery_zones language sql stable security definer set search_path = public as $$
  select z.* from public.delivery_zones z
  join public.cities c on c.id = z.city_id and c.is_active
  where z.is_active
    and (
      (p_lat is not null and p_lng is not null and public.haversine_km(p_lat, p_lng, z.center_lat, z.center_lng) <= z.radius_km)
      or (p_pincode is not null and z.pincode = p_pincode)
    )
  order by
    (p_lat is not null and p_lng is not null and public.haversine_km(p_lat, p_lng, z.center_lat, z.center_lng) <= z.radius_km) desc,
    case when p_lat is not null and p_lng is not null then public.haversine_km(p_lat, p_lng, z.center_lat, z.center_lng) else 999 end
  limit 1;
$$;

create or replace function public.check_serviceability(p_pincode text default null, p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare z public.delivery_zones; c public.cities;
begin
  z := public.find_zone(p_pincode, p_lat, p_lng);
  if z.id is null then
    return jsonb_build_object('serviceable', false, 'message', 'Sorry, ' || coalesce(public.get_setting('brand_name') #>> '{}', 'Merta Deal') || ' is not available in your area yet.');
  end if;
  select * into c from public.cities where id = z.city_id;
  return jsonb_build_object(
    'serviceable', true,
    'zone_id', z.id, 'zone_name', z.name, 'area', z.area, 'pincode', z.pincode,
    'city', c.name, 'city_slug', c.slug,
    'delivery_fee', z.delivery_fee, 'min_order_amount', z.min_order_amount,
    'free_delivery_threshold', z.free_delivery_threshold,
    'eta_min_minutes', z.eta_min_minutes, 'eta_max_minutes', z.eta_max_minutes,
    'express_supported', z.express_supported
  );
end $$;

-- Nearby stores for a location (public)
create or replace function public.nearby_stores(p_lat double precision, p_lng double precision, p_radius_km numeric default 10, p_limit int default 20)
returns table (
  id uuid, name text, slug text, tagline text, area text, logo_url text, cover_url text,
  rating_avg numeric, rating_count int, is_open boolean, avg_prep_minutes int, distance_km numeric, product_count bigint
) language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.slug, s.tagline, s.area, s.logo_url, s.cover_url, s.rating_avg, s.rating_count, s.is_open, s.avg_prep_minutes,
         round(public.haversine_km(p_lat, p_lng, s.lat, s.lng)::numeric, 2) as distance_km,
         (select count(*) from public.inventory i where i.store_id = s.id and i.is_active) as product_count
  from public.stores s
  where s.status = 'active'
    and public.haversine_km(p_lat, p_lng, s.lat, s.lng) <= least(p_radius_km, s.delivery_radius_km + 2)
  order by s.is_open desc, distance_km asc
  limit p_limit;
$$;

-- ----------------------------------------------------------------------------
-- Product cards view: product + best offer (cheapest available from active store)
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
where p.is_active and p.is_approved;

-- ----------------------------------------------------------------------------
-- Smart search: synonym expansion + full text + trigram fallback + filters
-- ----------------------------------------------------------------------------
create or replace function public.expand_search_query(p_query text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  tokens text[]; t text; parts text[] := '{}'; canon text; syns text[];
begin
  tokens := regexp_split_to_array(lower(extensions.unaccent(coalesce(p_query,''))), '\s+');
  foreach t in array tokens loop
    t := regexp_replace(t, '[^a-z0-9]', '', 'g');
    if length(t) < 2 then continue; end if;
    select canonical into canon from public.search_synonyms where term = t;
    if canon is null then
      select canonical into canon from public.search_synonyms where canonical = t limit 1;
    end if;
    if canon is not null then
      select array_agg(distinct x) into syns from (
        select term as x from public.search_synonyms where canonical = canon
        union select canon
      ) q;
      parts := parts || ('(' || array_to_string((select array_agg(s || ':*') from unnest(syns) s), ' | ') || ' | ' || t || ':*)');
    else
      parts := parts || (t || ':*');
    end if;
  end loop;
  return nullif(array_to_string(parts, ' & '), '');
end $$;

-- Canonical terms for a query (used to boost exact-concept matches in ranking)
create or replace function public.canonical_terms(p_query text)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct coalesce(sy.canonical, tok)), '{}')
  from unnest(regexp_split_to_array(lower(extensions.unaccent(coalesce(p_query,''))), '\s+')) tok
  left join public.search_synonyms sy on sy.term = regexp_replace(tok, '[^a-z0-9]', '', 'g')
  where length(tok) >= 2;
$$;

create or replace function public.search_products(
  p_query text default null,
  p_category_slug text default null,
  p_brand_slugs text[] default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_min_discount int default null,
  p_in_stock boolean default false,
  p_store_id uuid default null,
  p_local_only boolean default false,
  p_sort text default 'relevance',
  p_page int default 1,
  p_page_size int default 24
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
  if p_category_slug is not null then
    select array_agg(id) into v_cat_ids from public.categories
    where slug = p_category_slug or parent_id = (select id from public.categories where slug = p_category_slug);
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
      and (p_store_id is null or exists (select 1 from public.inventory i where i.product_id = v.id and i.store_id = p_store_id and i.is_active))
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

-- Fast typeahead across products, brands, categories, stores
create or replace function public.search_suggest(p_query text, p_limit int default 8)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text; v_tsq tsquery; v_products jsonb; v_brands jsonb; v_cats jsonb; v_stores jsonb;
begin
  v_q := nullif(trim(coalesce(p_query,'')), '');
  if v_q is null or length(v_q) < 2 then return jsonb_build_object('products','[]'::jsonb,'brands','[]'::jsonb,'categories','[]'::jsonb,'stores','[]'::jsonb); end if;
  begin v_tsq := to_tsquery('simple', public.expand_search_query(v_q)); exception when others then v_tsq := plainto_tsquery('simple', v_q); end;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug, 'image_url', image_url, 'pack_label', pack_label, 'selling_price', selling_price, 'brand_name', brand_name)), '[]'::jsonb)
  into v_products from (
    select v.id, v.name, v.slug, v.image_url, v.pack_label, v.selling_price, v.brand_name
    from public.v_product_cards v join public.products p on p.id = v.id
    where p.search_vector @@ v_tsq or extensions.similarity(lower(v.name), lower(v_q)) > 0.3
    order by ts_rank(p.search_vector, v_tsq) desc, v.popularity_score desc limit p_limit
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug)), '[]'::jsonb) into v_brands
  from (select id, name, slug from public.brands where is_active and (name ilike v_q || '%' or extensions.similarity(lower(name), lower(v_q)) > 0.4) order by name limit 4) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug, 'icon', icon)), '[]'::jsonb) into v_cats
  from (select id, name, slug, icon from public.categories where is_active and (name ilike '%' || v_q || '%' or extensions.similarity(lower(name), lower(v_q)) > 0.4) order by sort_order limit 4) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug, 'area', area)), '[]'::jsonb) into v_stores
  from (select id, name, slug, area from public.stores where status = 'active' and (name ilike '%' || v_q || '%' or extensions.similarity(lower(name), lower(v_q)) > 0.35) order by name limit 4) x;
  return jsonb_build_object('products', v_products, 'brands', v_brands, 'categories', v_cats, 'stores', v_stores);
end $$;

-- ----------------------------------------------------------------------------
-- Home feed (single round-trip for the mobile home screen)
-- ----------------------------------------------------------------------------
create or replace function public.home_feed(p_lat double precision default null, p_lng double precision default null, p_limit int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_lat double precision := coalesce(p_lat, (select center_lat from public.cities where slug = 'merta-city'));
  v_lng double precision := coalesce(p_lng, (select center_lng from public.cities where slug = 'merta-city'));
  r jsonb := '{}'::jsonb;
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
  r := r || jsonb_build_object('nearby_stores', (
    select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from public.nearby_stores(v_lat, v_lng, 15, 10) n));
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

-- ----------------------------------------------------------------------------
-- Product detail: all store offers + related + approved reviews
-- ----------------------------------------------------------------------------
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
        'inventory_id', i.id, 'store_id', s.id, 'store_name', s.name, 'store_slug', s.slug, 'store_area', s.area,
        'is_open', s.is_open, 'selling_price', i.selling_price, 'mrp', i.mrp, 'stock_qty', i.stock_qty, 'status', i.status,
        'max_order_qty', i.max_order_qty, 'avg_prep_minutes', s.avg_prep_minutes, 'rating_avg', s.rating_avg,
        'discount_pct', case when i.mrp > 0 then round(((i.mrp - i.selling_price)/i.mrp)*100) else 0 end
      ) order by (i.status <> 'out_of_stock') desc, i.selling_price), '[]'::jsonb)
      from public.inventory i join public.stores s on s.id = i.store_id and s.status = 'active' where i.product_id = v_p.id and i.is_active),
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

-- ----------------------------------------------------------------------------
-- CART
-- ----------------------------------------------------------------------------
create or replace function public.get_or_create_cart()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select id into v_id from public.carts where user_id = auth.uid() and status = 'active';
  if v_id is null then
    insert into public.carts (user_id) values (auth.uid()) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.add_to_cart(p_inventory_id uuid, p_quantity int default 1, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cart public.carts; v_inv public.inventory; v_store public.stores; v_qty int; v_cart_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_inv from public.inventory where id = p_inventory_id and is_active;
  if v_inv.id is null then raise exception 'ITEM_UNAVAILABLE'; end if;
  select * into v_store from public.stores where id = v_inv.store_id;
  if v_store.status <> 'active' then raise exception 'STORE_UNAVAILABLE'; end if;

  v_cart_id := public.get_or_create_cart();
  select * into v_cart from public.carts where id = v_cart_id;

  if v_cart.store_id is not null and v_cart.store_id <> v_inv.store_id
     and exists (select 1 from public.cart_items where cart_id = v_cart.id) then
    if not p_replace then
      return jsonb_build_object('ok', false, 'conflict', true,
        'current_store', (select jsonb_build_object('id', id, 'name', name) from public.stores where id = v_cart.store_id),
        'new_store', jsonb_build_object('id', v_store.id, 'name', v_store.name));
    end if;
    delete from public.cart_items where cart_id = v_cart.id;
    update public.carts set coupon_id = null where id = v_cart.id;
  end if;

  update public.carts set store_id = v_inv.store_id where id = v_cart.id;

  if p_quantity <= 0 then
    delete from public.cart_items where cart_id = v_cart.id and inventory_id = p_inventory_id;
  else
    v_qty := least(p_quantity, v_inv.max_order_qty, greatest(v_inv.stock_qty, 0));
    if v_qty <= 0 then raise exception 'OUT_OF_STOCK'; end if;
    insert into public.cart_items (cart_id, inventory_id, product_id, quantity)
    values (v_cart.id, p_inventory_id, v_inv.product_id, v_qty)
    on conflict (cart_id, inventory_id) do update set quantity = excluded.quantity, updated_at = now();
  end if;

  if not exists (select 1 from public.cart_items where cart_id = v_cart.id) then
    update public.carts set store_id = null, coupon_id = null where id = v_cart.id;
  end if;
  return jsonb_build_object('ok', true, 'cart_id', v_cart.id, 'quantity', greatest(p_quantity,0));
end $$;

create or replace function public.clear_cart()
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.get_or_create_cart();
begin
  delete from public.cart_items where cart_id = v_id;
  update public.carts set store_id = null, coupon_id = null where id = v_id;
end $$;

-- ----------------------------------------------------------------------------
-- COUPONS
-- ----------------------------------------------------------------------------
create or replace function public.validate_coupon(p_code text, p_store_id uuid, p_subtotal numeric, p_category_ids uuid[] default null, p_user_id uuid default auth.uid())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.coupons; v_disc numeric := 0; v_user_uses int; v_orders int;
begin
  select * into c from public.coupons where upper(code) = upper(trim(p_code));
  if c.id is null then return jsonb_build_object('valid', false, 'reason', 'Invalid coupon code'); end if;
  if not c.is_active then return jsonb_build_object('valid', false, 'reason', 'This coupon is no longer active'); end if;
  if c.starts_at > now() then return jsonb_build_object('valid', false, 'reason', 'This coupon is not active yet'); end if;
  if c.expires_at is not null and c.expires_at < now() then return jsonb_build_object('valid', false, 'reason', 'This coupon has expired'); end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then return jsonb_build_object('valid', false, 'reason', 'Coupon usage limit reached'); end if;
  if c.store_id is not null and c.store_id <> p_store_id then return jsonb_build_object('valid', false, 'reason', 'Coupon not valid for this store'); end if;
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
  v_res := public.validate_coupon(p_code, v_cart.store_id, v_sub, v_cats);
  if (v_res ->> 'valid')::boolean then
    update public.carts set coupon_id = (v_res ->> 'coupon_id')::uuid where id = v_cart.id;
  end if;
  return v_res;
end $$;

create or replace function public.remove_coupon()
returns void language sql security definer set search_path = public as $$
  update public.carts set coupon_id = null where id = public.get_or_create_cart();
$$;

-- ----------------------------------------------------------------------------
-- Cart totals: single source of truth for pricing (used by UI and place_order)
-- ----------------------------------------------------------------------------
create or replace function public.cart_summary(p_address_id uuid default null, p_delivery_type public.delivery_type default 'standard')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cart public.carts; v_store public.stores; v_addr public.addresses; v_zone public.delivery_zones;
  v_items jsonb; v_sub numeric := 0; v_mrp_total numeric := 0; v_count int := 0;
  v_delivery numeric := 0; v_threshold numeric; v_min_order numeric; v_gap numeric := 0;
  v_platform numeric; v_tax numeric := 0; v_tax_rate numeric; v_coupon jsonb := null; v_coupon_disc numeric := 0;
  v_total numeric; v_cats uuid[]; v_dist numeric; v_express_fee numeric := 0; v_eta_min int; v_eta_max int;
  v_serviceable boolean := true; v_msg text := null; v_issues jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_cart from public.carts where user_id = auth.uid() and status = 'active';
  if v_cart.id is null then
    return jsonb_build_object('items','[]'::jsonb,'item_count',0,'subtotal',0,'total',0,'empty',true);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ci.id, 'inventory_id', ci.inventory_id, 'product_id', p.id, 'name', p.name, 'slug', p.slug,
      'image_url', p.image_url, 'pack_label', p.pack_label, 'brand_name', b.name,
      'quantity', ci.quantity, 'unit_price', i.selling_price, 'unit_mrp', i.mrp,
      'line_total', ci.quantity * i.selling_price, 'stock_qty', i.stock_qty, 'max_order_qty', i.max_order_qty,
      'available', (i.is_active and i.stock_qty >= ci.quantity)
    ) order by ci.created_at), '[]'::jsonb),
    coalesce(sum(ci.quantity * i.selling_price),0), coalesce(sum(ci.quantity * i.mrp),0), coalesce(sum(ci.quantity),0),
    array_agg(distinct p.category_id)
  into v_items, v_sub, v_mrp_total, v_count, v_cats
  from public.cart_items ci
  join public.inventory i on i.id = ci.inventory_id
  join public.products p on p.id = ci.product_id
  left join public.brands b on b.id = p.brand_id
  where ci.cart_id = v_cart.id;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'available_qty', i.stock_qty)), '[]'::jsonb) into v_issues
  from public.cart_items ci join public.inventory i on i.id = ci.inventory_id join public.products p on p.id = ci.product_id
  where ci.cart_id = v_cart.id and (not i.is_active or i.stock_qty < ci.quantity);

  select * into v_store from public.stores where id = v_cart.store_id;

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
  v_min_order := greatest(coalesce(v_zone.min_order_amount, public.get_setting_num('min_order_amount', 99)), coalesce(v_store.min_order_amount, 0));
  v_delivery := coalesce(v_zone.delivery_fee, public.get_setting_num('delivery_fee_base', 25));
  v_eta_min := coalesce(v_zone.eta_min_minutes, public.get_setting_num('delivery_eta_min_minutes', 30)::int);
  v_eta_max := coalesce(v_zone.eta_max_minutes, public.get_setting_num('delivery_eta_max_minutes', 60)::int);

  -- distance surcharge beyond the included distance
  if v_addr.lat is not null and v_store.id is not null then
    v_dist := public.haversine_km(v_addr.lat, v_addr.lng, v_store.lat, v_store.lng);
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
    v_gap := 0; v_delivery := 0;
  else
    v_gap := greatest(v_threshold - v_sub, 0);
  end if;

  v_platform := case when v_count > 0 then public.get_setting_num('platform_fee', 2) else 0 end;
  v_tax_rate := public.get_setting_num('tax_rate_percent', 18);
  v_tax := round((v_delivery + v_express_fee + v_platform) * v_tax_rate / 100, 2);

  if v_cart.coupon_id is not null then
    v_coupon := public.validate_coupon((select code from public.coupons where id = v_cart.coupon_id), v_cart.store_id, v_sub, v_cats);
    if (v_coupon ->> 'valid')::boolean then v_coupon_disc := (v_coupon ->> 'discount')::numeric; end if;
  end if;

  v_total := greatest(v_sub - v_coupon_disc, 0) + v_delivery + v_express_fee + v_platform + v_tax;

  return jsonb_build_object(
    'cart_id', v_cart.id, 'empty', v_count = 0,
    'store', case when v_store.id is null then null else jsonb_build_object('id', v_store.id, 'name', v_store.name, 'slug', v_store.slug, 'area', v_store.area, 'is_open', v_store.is_open, 'avg_prep_minutes', v_store.avg_prep_minutes, 'lat', v_store.lat, 'lng', v_store.lng) end,
    'items', v_items, 'item_count', v_count, 'issues', v_issues,
    'subtotal', v_sub, 'mrp_total', v_mrp_total, 'item_savings', v_mrp_total - v_sub,
    'coupon', v_coupon, 'coupon_discount', v_coupon_disc,
    'delivery_fee', v_delivery, 'express_fee', v_express_fee, 'platform_fee', v_platform, 'tax', v_tax, 'tax_rate', v_tax_rate,
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

-- ----------------------------------------------------------------------------
-- ORDER STATUS TRANSITION (internal)
-- ----------------------------------------------------------------------------
create or replace function public._set_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; v_title text; v_body text; v_store_name text;
begin
  select * into o from public.orders where id = p_order_id for update;
  update public.orders set
    status = p_status,
    store_confirmed_at = case when p_status = 'store_confirmed' then now() else store_confirmed_at end,
    ready_at = case when p_status = 'ready_for_pickup' then now() else ready_at end,
    picked_up_at = case when p_status = 'out_for_delivery' then now() else picked_up_at end,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    cancelled_at = case when p_status in ('cancelled','rejected') then now() else cancelled_at end
  where id = p_order_id;

  insert into public.order_status_history (order_id, status, actor_id, actor_role, note)
  values (p_order_id, p_status, auth.uid(), public.current_user_role(), p_note);

  select name into v_store_name from public.stores where id = o.store_id;
  v_title := case p_status
    when 'store_confirmed' then 'Order confirmed by ' || v_store_name
    when 'preparing' then 'Your order is being packed'
    when 'ready_for_pickup' then 'Order packed & ready'
    when 'rider_assigned' then 'Delivery partner assigned'
    when 'out_for_delivery' then 'Out for delivery'
    when 'delivered' then 'Order delivered'
    when 'completed' then 'Order completed'
    when 'cancelled' then 'Order cancelled'
    when 'rejected' then 'Order could not be accepted'
    else 'Order update' end;
  v_body := case p_status
    when 'store_confirmed' then format('%s has confirmed order %s and will start packing shortly.', v_store_name, o.order_number)
    when 'preparing' then format('%s is packing your order %s.', v_store_name, o.order_number)
    when 'ready_for_pickup' then format('Order %s is packed. We are assigning a delivery partner.', o.order_number)
    when 'rider_assigned' then format('A delivery partner is on the way to pick up order %s.', o.order_number)
    when 'out_for_delivery' then format('Order %s is on its way. Share the OTP with the rider at delivery.', o.order_number)
    when 'delivered' then format('Order %s was delivered. Enjoy! Please rate your experience.', o.order_number)
    when 'completed' then format('Thank you for shopping with us. Order %s is complete.', o.order_number)
    when 'cancelled' then format('Order %s has been cancelled. %s', o.order_number, coalesce(p_note,''))
    when 'rejected' then format('%s could not accept order %s. %s', v_store_name, o.order_number, coalesce(p_note,'Any payment made will be refunded.'))
    else o.order_number end;
  perform public.notify_user(o.user_id, 'order_status', v_title, v_body, jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'status', p_status));
end $$;

-- ----------------------------------------------------------------------------
-- PLACE ORDER
-- ----------------------------------------------------------------------------
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
  v_uid uuid := auth.uid(); v_cart public.carts; v_sum jsonb; v_store public.stores; v_addr public.addresses;
  v_order_id uuid; v_order_no text; v_total numeric; v_sub numeric; v_commission_rate numeric; v_commission numeric;
  v_otp text; v_item record; v_zone_id uuid; v_pay_status public.payment_status; v_provider public.payment_provider;
  v_eta int; v_coupon_id uuid; v_coupon_code text; v_coupon_disc numeric; v_payout numeric; v_rider_earning numeric;
  v_wallet numeric;
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

  select * into v_store from public.stores where id = v_cart.store_id for update;
  if v_store.status <> 'active' then raise exception 'STORE_UNAVAILABLE'; end if;
  if not v_store.is_open and p_delivery_type <> 'scheduled' then raise exception 'STORE_CLOSED'; end if;

  v_sub := (v_sum ->> 'subtotal')::numeric;
  v_total := (v_sum ->> 'total')::numeric;
  v_coupon_disc := (v_sum ->> 'coupon_discount')::numeric;
  v_coupon_id := case when v_coupon_disc > 0 then (v_sum #>> '{coupon,coupon_id}')::uuid end;
  v_coupon_code := case when v_coupon_disc > 0 then v_sum #>> '{coupon,code}' end;
  v_zone_id := (v_sum #>> '{zone,id}')::uuid;
  v_eta := (v_sum ->> 'eta_max_minutes')::int + v_store.avg_prep_minutes;

  v_commission_rate := coalesce(v_store.commission_rate, public.get_setting_num('commission_default_percent', 10));
  v_commission := round((v_sub - v_coupon_disc) * v_commission_rate / 100, 2);
  v_payout := (v_sub - v_coupon_disc) - v_commission;
  v_rider_earning := public.get_setting_num('rider_base_earning', 20) + ceil((v_sum ->> 'distance_km')::numeric) * public.get_setting_num('rider_per_km_earning', 5);

  if p_payment_method = 'wallet' then
    select wallet_balance into v_wallet from public.profiles where id = v_uid for update;
    if v_wallet < v_total then raise exception 'INSUFFICIENT_WALLET'; end if;
  end if;

  v_pay_status := case when p_payment_method = 'cod' then 'cod_pending' when p_payment_method = 'wallet' then 'paid' else 'pending' end;
  v_provider := case when p_payment_method = 'cod' then 'cod' when p_payment_method = 'wallet' then 'wallet' else 'razorpay' end;
  v_order_no := public.generate_order_number();
  v_otp := lpad(floor(random() * 10000)::int::text, 4, '0');

  insert into public.orders (
    order_number, user_id, store_id, zone_id, status, delivery_type, scheduled_slot_start, scheduled_slot_end,
    address_snapshot, delivery_lat, delivery_lng, delivery_instructions, payment_method, payment_status,
    subtotal, item_discount, coupon_id, coupon_code, coupon_discount, delivery_fee, platform_fee, tax_amount, total,
    commission_rate, commission_amount, store_payout_amount, rider_earning, item_count, eta_minutes, promised_at
  ) values (
    v_order_no, v_uid, v_store.id, v_zone_id, 'placed', p_delivery_type, p_scheduled_start, p_scheduled_end,
    to_jsonb(v_addr) - 'user_id', v_addr.lat, v_addr.lng, p_instructions, p_payment_method, v_pay_status,
    v_sub, (v_sum ->> 'item_savings')::numeric, v_coupon_id, v_coupon_code, v_coupon_disc,
    (v_sum ->> 'delivery_fee')::numeric + (v_sum ->> 'express_fee')::numeric, (v_sum ->> 'platform_fee')::numeric, (v_sum ->> 'tax')::numeric, v_total,
    v_commission_rate, v_commission, v_payout, v_rider_earning, (v_sum ->> 'item_count')::int, v_eta,
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
  update public.stores set total_orders = total_orders + 1 where id = v_store.id;

  insert into public.order_status_history (order_id, status, actor_id, actor_role, note) values (v_order_id, 'placed', v_uid, 'customer', null);
  perform public.notify_user(v_uid, 'order_placed', 'Order placed', format('Order %s placed with %s. Total ₹%s. Delivery OTP: %s', v_order_no, v_store.name, to_char(v_total,'FM9999990.00'), v_otp),
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'status', 'placed'));
  perform public.notify_store(v_store.id, 'new_order', 'New order ' || v_order_no,
    format('%s items · ₹%s · %s. Please accept within %s minutes.', (v_sum ->> 'item_count'), to_char(v_total,'FM9999990.00'), upper(p_payment_method::text), public.get_setting_num('store_accept_window_minutes', 5)),
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no));
  perform public.audit('order.place', 'orders', v_order_id::text, null, jsonb_build_object('order_number', v_order_no, 'total', v_total));

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'total', v_total,
    'payment_required', v_provider = 'razorpay', 'payment_method', p_payment_method);
end $$;

-- Used by the Razorpay server routes (with service role) after signature verification.
create or replace function public.confirm_online_payment(p_order_id uuid, p_provider_order_id text, p_provider_payment_id text, p_signature text, p_raw jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  update public.payments set status = 'paid', provider_order_id = p_provider_order_id, provider_payment_id = p_provider_payment_id,
    provider_signature = p_signature, raw_response = coalesce(p_raw, raw_response) where order_id = p_order_id;
  update public.orders set payment_status = 'paid' where id = p_order_id;
  perform public.notify_user(o.user_id, 'payment', 'Payment received', format('₹%s received for order %s.', to_char(o.total,'FM9999990.00'), o.order_number), jsonb_build_object('order_id', o.id));
  perform public.notify_store(o.store_id, 'payment_update', 'Payment confirmed for ' || o.order_number, 'Online payment was successful.', jsonb_build_object('order_id', o.id));
end $$;

create or replace function public.mark_payment_failed(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.payments set status = 'failed', failure_reason = p_reason where order_id = p_order_id and status = 'pending';
  update public.orders set payment_status = 'failed' where id = p_order_id and payment_status = 'pending';
end $$;

-- ----------------------------------------------------------------------------
-- STORE ORDER ACTIONS (store can never mark delivered)
-- ----------------------------------------------------------------------------
create or replace function public.store_update_order(p_order_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_assignment uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if not (public.is_store_member(o.store_id) or public.is_admin()) then raise exception 'FORBIDDEN'; end if;

  case p_action
    when 'accept' then
      if o.status <> 'placed' then raise exception 'INVALID_TRANSITION: % -> accept', o.status; end if;
      perform public._set_order_status(o.id, 'store_confirmed', p_note);
    when 'reject' then
      if o.status <> 'placed' then raise exception 'INVALID_TRANSITION: % -> reject', o.status; end if;
      for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
        update public.inventory set stock_qty = stock_qty + v_item.quantity, sold_count = greatest(sold_count - v_item.quantity, 0) where id = v_item.inventory_id;
        insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, v_item.quantity, 'reject_restock', o.id, auth.uid());
      end loop;
      update public.orders set reject_reason = p_note where id = o.id;
      perform public._handle_refund_on_cancel(o.id);
      perform public._set_order_status(o.id, 'rejected', p_note);
    when 'preparing' then
      if o.status <> 'store_confirmed' then raise exception 'INVALID_TRANSITION: % -> preparing', o.status; end if;
      perform public._set_order_status(o.id, 'preparing', p_note);
    when 'ready' then
      if o.status not in ('store_confirmed','preparing') then raise exception 'INVALID_TRANSITION: % -> ready', o.status; end if;
      perform public._set_order_status(o.id, 'ready_for_pickup', p_note);
      v_assignment := public.auto_dispatch(o.id);
    else raise exception 'UNKNOWN_ACTION';
  end case;
  return jsonb_build_object('ok', true, 'status', (select status from public.orders where id = o.id), 'assignment_id', v_assignment);
end $$;

-- Refund handling on cancel/reject: wallet refunds immediately; online payments flagged for provider refund.
create or replace function public._handle_refund_on_cancel(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; v_bal numeric;
begin
  select * into o from public.orders where id = p_order_id;
  if o.payment_method = 'wallet' and o.payment_status = 'paid' then
    update public.profiles set wallet_balance = wallet_balance + o.total where id = o.user_id returning wallet_balance into v_bal;
    insert into public.wallet_transactions (user_id, type, amount, balance_after, description, order_id)
    values (o.user_id, 'refund', o.total, v_bal, 'Refund for order ' || o.order_number, o.id);
    update public.payments set status = 'refunded', refund_amount = o.total where order_id = o.id;
    update public.orders set payment_status = 'refunded' where id = o.id;
  elsif o.payment_status = 'paid' then
    update public.payments set refund_required = true where order_id = o.id;
    perform public.notify_user(o.user_id, 'refund', 'Refund initiated', format('₹%s for order %s will be refunded to your original payment method within 5-7 working days.', to_char(o.total,'FM9999990.00'), o.order_number), jsonb_build_object('order_id', o.id));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- DISPATCH
-- ----------------------------------------------------------------------------
create or replace function public.auto_dispatch(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; s public.stores; r record; v_id uuid; v_dist numeric;
begin
  select * into o from public.orders where id = p_order_id;
  if o.status not in ('ready_for_pickup') then return null; end if;
  if exists (select 1 from public.delivery_assignments where order_id = o.id and status in ('offered','accepted','picked_up')) then return null; end if;
  select * into s from public.stores where id = o.store_id;

  -- Expire stale offers first
  update public.delivery_assignments set status = 'expired' where status = 'offered' and expires_at < now();

  select dp.*, public.haversine_km(dp.current_lat, dp.current_lng, s.lat, s.lng) as dist into r
  from public.delivery_partners dp
  where dp.status = 'active' and dp.is_online
    and dp.current_lat is not null
    and (dp.city_id is null or dp.city_id = s.city_id)
    and public.haversine_km(dp.current_lat, dp.current_lng, s.lat, s.lng) <= public.get_setting_num('dispatch_radius_km', 8)
    and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.status in ('offered','accepted','picked_up'))
    and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.order_id = o.id and a.status in ('rejected','expired'))
  order by dist asc, dp.rating_avg desc
  limit 1;

  if r.id is null then
    perform public.audit('dispatch.no_rider', 'orders', o.id::text, null, jsonb_build_object('order_number', o.order_number));
    return null;
  end if;

  v_dist := coalesce(public.haversine_km(s.lat, s.lng, o.delivery_lat, o.delivery_lng), 0);
  insert into public.delivery_assignments (order_id, rider_id, status, expires_at, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, earning, cod_amount)
  values (o.id, r.id, 'offered', now() + make_interval(secs => public.get_setting_num('dispatch_offer_timeout_seconds', 180)),
          s.lat, s.lng, o.delivery_lat, o.delivery_lng, round(v_dist::numeric, 2), o.rider_earning,
          case when o.payment_method = 'cod' then o.total else 0 end)
  returning id into v_id;

  perform public.notify_user(r.user_id, 'delivery_offer', 'New delivery request',
    format('Pickup from %s · %s km · Earn ₹%s', s.name, round(v_dist::numeric,1), to_char(o.rider_earning,'FM9999990')),
    jsonb_build_object('assignment_id', v_id, 'order_id', o.id, 'order_number', o.order_number));
  return v_id;
end $$;

create or replace function public.admin_assign_rider(p_order_id uuid, p_rider_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; s public.stores; dp public.delivery_partners; v_id uuid; v_dist numeric;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.status not in ('ready_for_pickup','preparing','store_confirmed') then raise exception 'INVALID_STATE: %', o.status; end if;
  select * into dp from public.delivery_partners where id = p_rider_id and status = 'active';
  if dp.id is null then raise exception 'RIDER_NOT_FOUND'; end if;
  update public.delivery_assignments set status = 'cancelled' where order_id = o.id and status = 'offered';
  select * into s from public.stores where id = o.store_id;
  v_dist := coalesce(public.haversine_km(s.lat, s.lng, o.delivery_lat, o.delivery_lng), 0);
  insert into public.delivery_assignments (order_id, rider_id, status, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, earning, cod_amount, note)
  values (o.id, dp.id, 'offered', s.lat, s.lng, o.delivery_lat, o.delivery_lng, round(v_dist::numeric,2), o.rider_earning,
          case when o.payment_method = 'cod' then o.total else 0 end, 'Assigned by admin')
  returning id into v_id;
  perform public.notify_user(dp.user_id, 'delivery_offer', 'New delivery request (admin)', format('Pickup from %s · Earn ₹%s', s.name, to_char(o.rider_earning,'FM9999990')),
    jsonb_build_object('assignment_id', v_id, 'order_id', o.id, 'order_number', o.order_number));
  perform public.audit('dispatch.manual_assign', 'orders', o.id::text, null, jsonb_build_object('rider_id', dp.id));
  return v_id;
end $$;

-- ----------------------------------------------------------------------------
-- RIDER ACTIONS
-- ----------------------------------------------------------------------------
create or replace function public.rider_set_online(p_online boolean, p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  if dp.status <> 'active' and p_online then raise exception 'RIDER_NOT_ACTIVE'; end if;
  update public.delivery_partners set is_online = p_online,
    current_lat = coalesce(p_lat, current_lat), current_lng = coalesce(p_lng, current_lng),
    last_location_at = case when p_lat is not null then now() else last_location_at end
  where id = dp.id;
  return jsonb_build_object('ok', true, 'is_online', p_online);
end $$;

create or replace function public.record_rider_location(p_lat double precision, p_lng double precision, p_accuracy double precision default null, p_heading double precision default null, p_speed double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners; a record; n int := 0;
begin
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'INVALID_COORDS'; end if;
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  update public.delivery_partners set current_lat = p_lat, current_lng = p_lng, last_location_at = now() where id = dp.id;
  for a in select id from public.delivery_assignments where rider_id = dp.id and status in ('accepted','picked_up') loop
    insert into public.delivery_locations (assignment_id, rider_id, lat, lng, accuracy_m, heading, speed_mps)
    values (a.id, dp.id, p_lat, p_lng, p_accuracy, p_heading, p_speed);
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'tracked_assignments', n);
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
    perform public.notify_store(o.store_id, 'rider_assigned', 'Rider assigned for ' || o.order_number, 'A delivery partner is heading to your store for pickup.', jsonb_build_object('order_id', o.id));
    return jsonb_build_object('ok', true, 'status', 'accepted');
  else
    update public.delivery_assignments set status = 'rejected', responded_at = now() where id = a.id;
    v_next := public.auto_dispatch(o.id);
    return jsonb_build_object('ok', true, 'status', 'rejected', 'reassigned_to', v_next);
  end if;
end $$;

create or replace function public.rider_pickup(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; dp public.delivery_partners; o public.orders;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  if a.status <> 'accepted' then raise exception 'INVALID_STATE: %', a.status; end if;
  select * into o from public.orders where id = a.order_id for update;
  if o.status not in ('rider_assigned','ready_for_pickup') then raise exception 'ORDER_NOT_READY: %', o.status; end if;
  update public.delivery_assignments set status = 'picked_up', picked_up_at = now() where id = a.id;
  perform public._set_order_status(o.id, 'out_for_delivery', null);
  return jsonb_build_object('ok', true, 'status', 'picked_up');
end $$;

create or replace function public.verify_delivery_otp(p_assignment_id uuid, p_otp text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; dp public.delivery_partners; o public.orders; sec public.order_secrets; v_points int; v_max int;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  if a.status <> 'picked_up' then raise exception 'INVALID_STATE: %', a.status; end if;
  select * into o from public.orders where id = a.order_id for update;
  select * into sec from public.order_secrets where order_id = o.id for update;
  v_max := public.get_setting_num('otp_max_attempts', 5)::int;
  if sec.otp_attempts >= v_max then return jsonb_build_object('ok', false, 'reason', 'Too many attempts. Contact support.'); end if;
  if sec.delivery_otp <> regexp_replace(coalesce(p_otp,''), '\D', '', 'g') then
    update public.order_secrets set otp_attempts = otp_attempts + 1 where order_id = o.id;
    return jsonb_build_object('ok', false, 'reason', 'Incorrect OTP', 'attempts_left', v_max - sec.otp_attempts - 1);
  end if;

  update public.delivery_assignments set status = 'delivered', delivered_at = now() where id = a.id;
  perform public._set_order_status(o.id, 'delivered', null);

  if o.payment_method = 'cod' then
    update public.payments set status = 'cod_collected', collected_by = auth.uid(), collected_at = now() where order_id = o.id;
    update public.orders set payment_status = 'cod_collected' where id = o.id;
  end if;

  update public.delivery_partners set total_deliveries = total_deliveries + 1, total_earnings = total_earnings + a.earning where id = dp.id;

  v_points := floor(o.subtotal / 100) * public.get_setting_num('reward_points_per_100', 1)::int;
  if v_points > 0 then
    update public.profiles set reward_points = reward_points + v_points where id = o.user_id;
    insert into public.reward_transactions (user_id, points, reason, order_id) values (o.user_id, v_points, 'Order ' || o.order_number, o.id);
  end if;
  perform public.notify_store(o.store_id, 'order_delivered', 'Order ' || o.order_number || ' delivered', 'Delivered successfully by the rider.', jsonb_build_object('order_id', o.id));
  return jsonb_build_object('ok', true, 'status', 'delivered', 'reward_points', v_points);
end $$;

-- ----------------------------------------------------------------------------
-- CUSTOMER ORDER ACTIONS
-- ----------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_is_admin boolean := public.is_admin();
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if not (v_is_admin or o.user_id = auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if o.status in ('delivered','completed','cancelled','rejected') then raise exception 'CANNOT_CANCEL: %', o.status; end if;
  if not v_is_admin and o.status not in ('placed','store_confirmed') then raise exception 'CANNOT_CANCEL: order is already being prepared. Please contact support.'; end if;

  for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
    update public.inventory set stock_qty = stock_qty + v_item.quantity, sold_count = greatest(sold_count - v_item.quantity, 0) where id = v_item.inventory_id;
    insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, v_item.quantity, 'cancel_restock', o.id, auth.uid());
  end loop;
  update public.delivery_assignments set status = 'cancelled' where order_id = o.id and status in ('offered','accepted','picked_up');
  update public.orders set cancelled_by = auth.uid(), cancel_reason = p_reason where id = o.id;
  perform public._handle_refund_on_cancel(o.id);
  perform public._set_order_status(o.id, 'cancelled', p_reason);
  perform public.notify_store(o.store_id, 'order_cancelled', 'Order ' || o.order_number || ' cancelled', coalesce(p_reason, 'Cancelled by customer.'), jsonb_build_object('order_id', o.id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.mark_order_completed(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if not (public.is_admin() or o.user_id = auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if o.status <> 'delivered' then raise exception 'INVALID_STATE: %', o.status; end if;
  perform public._set_order_status(o.id, 'completed', null);
  return jsonb_build_object('ok', true);
end $$;

-- Reorder: put all items from a past order into the cart
create or replace function public.reorder(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_added int := 0; v_skipped jsonb := '[]'::jsonb; v_res jsonb; v_first boolean := true;
begin
  select * into o from public.orders where id = p_order_id and user_id = auth.uid();
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  for v_item in
    select oi.product_name, oi.quantity, i.id as inventory_id, i.stock_qty, i.is_active
    from public.order_items oi
    left join public.inventory i on i.product_id = oi.product_id and i.store_id = o.store_id
    where oi.order_id = o.id
  loop
    if v_item.inventory_id is null or not v_item.is_active or v_item.stock_qty <= 0 then
      v_skipped := v_skipped || jsonb_build_object('name', v_item.product_name);
      continue;
    end if;
    v_res := public.add_to_cart(v_item.inventory_id, least(v_item.quantity, v_item.stock_qty), v_first);
    v_first := false;
    if (v_res ->> 'ok')::boolean then v_added := v_added + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skipped);
end $$;

-- ----------------------------------------------------------------------------
-- REVIEWS
-- ----------------------------------------------------------------------------
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
  insert into public.reviews (user_id, order_id, target, product_id, store_id, rider_id, rating, title, comment)
  values (auth.uid(), o.id, p_target, case when p_target = 'product' then p_product_id end,
          case when p_target = 'store' then o.store_id end, case when p_target = 'delivery' then v_rider end,
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
  elsif r.target = 'store' and r.store_id is not null then
    update public.stores st set rating_avg = coalesce(s.avg,0), rating_count = coalesce(s.cnt,0)
    from (select round(avg(rating)::numeric,2) avg, count(*) cnt from public.reviews where store_id = r.store_id and status = 'approved') s
    where st.id = r.store_id;
  elsif r.target = 'delivery' and r.rider_id is not null then
    update public.delivery_partners dp set rating_avg = coalesce(s.avg,0), rating_count = coalesce(s.cnt,0)
    from (select round(avg(rating)::numeric,2) avg, count(*) cnt from public.reviews where rider_id = r.rider_id and status = 'approved') s
    where dp.id = r.rider_id;
  end if;
  return null;
end $$;
create trigger reviews_recompute_trg after insert or update of status, rating or delete on public.reviews
for each row execute function public.reviews_recompute_ratings();

create or replace function public.moderate_review(p_review_id uuid, p_status public.review_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.reviews set status = p_status, moderated_by = auth.uid(), moderation_note = p_note where id = p_review_id;
end $$;

-- ----------------------------------------------------------------------------
-- STORE: create/update product + inventory in one go
-- ----------------------------------------------------------------------------
create or replace function public.upsert_store_product(
  p_store_id uuid, p_name text, p_category_id uuid, p_brand_name text, p_weight_value numeric, p_weight_unit text, p_pack_label text,
  p_mrp numeric, p_selling_price numeric, p_stock_qty int, p_low_stock_threshold int default 5, p_description text default null,
  p_image_url text default null, p_is_local boolean default false, p_is_veg boolean default true, p_product_id uuid default null, p_max_order_qty int default 10
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pid uuid := p_product_id; v_bid uuid; v_slug text; v_inv uuid;
begin
  if not (public.is_store_member(p_store_id) or public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_selling_price > p_mrp then raise exception 'PRICE_ABOVE_MRP'; end if;
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
  insert into public.inventory (store_id, product_id, selling_price, mrp, stock_qty, low_stock_threshold, max_order_qty)
  values (p_store_id, v_pid, p_selling_price, p_mrp, p_stock_qty, p_low_stock_threshold, p_max_order_qty)
  on conflict (store_id, product_id) do update set selling_price = excluded.selling_price, mrp = excluded.mrp, stock_qty = excluded.stock_qty,
    low_stock_threshold = excluded.low_stock_threshold, max_order_qty = excluded.max_order_qty, is_active = true, updated_at = now()
  returning id into v_inv;
  return jsonb_build_object('product_id', v_pid, 'inventory_id', v_inv);
end $$;

create or replace function public.adjust_stock(p_inventory_id uuid, p_delta int, p_reason text default 'manual_adjust', p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare inv public.inventory;
begin
  select * into inv from public.inventory where id = p_inventory_id for update;
  if inv.id is null then raise exception 'NOT_FOUND'; end if;
  if not (public.is_store_member(inv.store_id) or public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if inv.stock_qty + p_delta < 0 then raise exception 'NEGATIVE_STOCK'; end if;
  update public.inventory set stock_qty = stock_qty + p_delta where id = inv.id;
  insert into public.inventory_movements (inventory_id, delta, reason, actor_id, note) values (inv.id, p_delta, p_reason, auth.uid(), p_note);
  return inv.stock_qty + p_delta;
end $$;

-- ----------------------------------------------------------------------------
-- DASHBOARD STATS
-- ----------------------------------------------------------------------------
create or replace function public.store_dashboard_stats(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not (public.is_store_member(p_store_id) or public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'today_orders', (select count(*) from public.orders where store_id = p_store_id and (created_at at time zone 'Asia/Kolkata')::date = v_today),
    'today_revenue', (select coalesce(sum(store_payout_amount),0) from public.orders where store_id = p_store_id and (created_at at time zone 'Asia/Kolkata')::date = v_today and status not in ('cancelled','rejected')),
    'pending_orders', (select count(*) from public.orders where store_id = p_store_id and status in ('placed')),
    'active_orders', (select count(*) from public.orders where store_id = p_store_id and status in ('store_confirmed','preparing','ready_for_pickup','rider_assigned','out_for_delivery')),
    'completed_orders', (select count(*) from public.orders where store_id = p_store_id and status in ('delivered','completed')),
    'cancelled_orders', (select count(*) from public.orders where store_id = p_store_id and status in ('cancelled','rejected')),
    'total_revenue', (select coalesce(sum(store_payout_amount),0) from public.orders where store_id = p_store_id and status in ('delivered','completed')),
    'products', (select count(*) from public.inventory where store_id = p_store_id and is_active),
    'low_stock', (select count(*) from public.inventory where store_id = p_store_id and is_active and status = 'low_stock'),
    'out_of_stock', (select count(*) from public.inventory where store_id = p_store_id and is_active and status = 'out_of_stock'),
    'rating_avg', (select rating_avg from public.stores where id = p_store_id),
    'weekly', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', c, 'revenue', r) order by d), '[]'::jsonb) from (
        select (created_at at time zone 'Asia/Kolkata')::date d, count(*) c, coalesce(sum(store_payout_amount),0) r from public.orders
        where store_id = p_store_id and created_at > now() - interval '7 days' and status not in ('cancelled','rejected') group by 1) w)
  );
end $$;

create or replace function public.rider_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare dp public.delivery_partners; v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  return jsonb_build_object(
    'rider', to_jsonb(dp),
    'today_deliveries', (select count(*) from public.delivery_assignments where rider_id = dp.id and status = 'delivered' and (delivered_at at time zone 'Asia/Kolkata')::date = v_today),
    'today_earnings', (select coalesce(sum(earning),0) from public.delivery_assignments where rider_id = dp.id and status = 'delivered' and (delivered_at at time zone 'Asia/Kolkata')::date = v_today),
    'week_earnings', (select coalesce(sum(earning),0) from public.delivery_assignments where rider_id = dp.id and status = 'delivered' and delivered_at > now() - interval '7 days'),
    'cod_in_hand', (select coalesce(sum(cod_amount),0) from public.delivery_assignments where rider_id = dp.id and status = 'delivered' and (delivered_at at time zone 'Asia/Kolkata')::date = v_today),
    'new_requests', (select count(*) from public.delivery_assignments where rider_id = dp.id and status = 'offered' and expires_at > now()),
    'active', (select count(*) from public.delivery_assignments where rider_id = dp.id and status in ('accepted','picked_up'))
  );
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
    'revenue', (select coalesce(sum(commission_amount + platform_fee + delivery_fee - rider_earning),0) from public.orders where status in ('delivered','completed')),
    'customers', (select count(*) from public.profiles where role = 'customer'),
    'stores', (select count(*) from public.stores where status = 'active'),
    'pending_stores', (select count(*) from public.stores where status = 'pending'),
    'riders', (select count(*) from public.delivery_partners where status = 'active'),
    'online_riders', (select count(*) from public.delivery_partners where status = 'active' and is_online),
    'pending_orders', (select count(*) from public.orders where status in ('placed','store_confirmed','preparing','ready_for_pickup','rider_assigned','out_for_delivery')),
    'cancelled_orders', (select count(*) from public.orders where status in ('cancelled','rejected')),
    'avg_delivery_minutes', (select round(avg(extract(epoch from (delivered_at - created_at))/60)) from public.orders where delivered_at is not null),
    'on_time_pct', (select round(100.0 * count(*) filter (where delivered_at <= promised_at) / nullif(count(*),0)) from public.orders where delivered_at is not null and promised_at is not null),
    'pending_reviews', (select count(*) from public.reviews where status = 'pending'),
    'open_tickets', (select count(*) from public.support_tickets where status in ('open','in_progress')),
    'refunds_pending', (select count(*) from public.payments where refund_required and status <> 'refunded'),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', c, 'gmv', g) order by d), '[]'::jsonb) from (
        select (created_at at time zone 'Asia/Kolkata')::date d, count(*) c, coalesce(sum(total),0) g from public.orders
        where created_at > now() - interval '14 days' and status not in ('cancelled','rejected') group by 1) w),
    'status_breakdown', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select status, count(*) c from public.orders group by status) s)
  );
end $$;

-- Support ticket number
create or replace function public.support_ticket_number()
returns trigger language plpgsql as $$
begin
  if new.ticket_number is null or new.ticket_number = '' then
    new.ticket_number := 'TK' || to_char(now(), 'YYMMDD') || lpad((floor(random()*10000))::int::text, 4, '0');
  end if;
  return new;
end $$;
create trigger support_ticket_number_trg before insert on public.support_tickets for each row execute function public.support_ticket_number();

-- Wishlist toggle
create or replace function public.toggle_wishlist(p_product_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists (select 1 from public.wishlists where user_id = auth.uid() and product_id = p_product_id) then
    delete from public.wishlists where user_id = auth.uid() and product_id = p_product_id; return false;
  else
    insert into public.wishlists (user_id, product_id) values (auth.uid(), p_product_id); return true;
  end if;
end $$;

-- Admin: change a user's role (super_admin only for admin roles)
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

-- Grants: functions are executable by authenticated (and a few by anon)
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.search_products(text,text,text[],numeric,numeric,int,boolean,uuid,boolean,text,int,int) to anon;
grant execute on function public.search_suggest(text,int) to anon;
grant execute on function public.home_feed(double precision,double precision,int) to anon;
grant execute on function public.product_detail(text) to anon;
grant execute on function public.check_serviceability(text,double precision,double precision) to anon;
grant execute on function public.nearby_stores(double precision,double precision,numeric,int) to anon;
grant execute on function public.public_settings() to anon;
grant execute on function public.expand_search_query(text) to anon;
grant execute on function public.canonical_terms(text) to anon;
grant execute on function public.haversine_km(double precision,double precision,double precision,double precision) to anon;
grant select on public.v_product_cards to anon, authenticated;
