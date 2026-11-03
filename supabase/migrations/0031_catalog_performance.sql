-- 0031: catalogue read performance.
--  * search_products returns only what a product card renders (no tags, no created_at, one image),
--    which roughly halves the listing payload; sorting, filtering and paging are unchanged.
--  * product_detail carries shelf life, seller details and "more from this brand", so the product
--    page is one round trip instead of three.
-- Idempotent (create or replace only).

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
  -- Card payload only: the grid never reads tags or created_at, and uses at most one fallback image.
  select coalesce(jsonb_agg((to_jsonb(paged) - 'rank' - 'tags' - 'created_at')
           || jsonb_build_object('images', case when paged.images[1] is not null then jsonb_build_array(paged.images[1]) else '[]'::jsonb end)), '[]'::jsonb),
         (select total from counted)
  into v_items, v_total from paged;

  return jsonb_build_object('items', v_items, 'total', v_total, 'page', greatest(coalesce(p_page,1),1), 'page_size', v_size,
                            'has_more', (v_offset + v_size) < v_total);
end $$;

create or replace function public.product_detail(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_p record; v_row record; r jsonb;
begin
  select * into v_p from public.v_product_cards where slug = p_slug;
  if v_p.id is null then return null; end if;
  select description, ingredients, nutrition, manufacturer, country_of_origin, shelf_life, seller_name, seller_address, seller_license
    into v_row from public.products where id = v_p.id;
  r := to_jsonb(v_p);
  r := r || jsonb_build_object(
    'description', v_row.description,
    'ingredients', v_row.ingredients,
    'nutrition', v_row.nutrition,
    'manufacturer', v_row.manufacturer,
    'country_of_origin', v_row.country_of_origin,
    'shelf_life', v_row.shelf_life,
    'seller_name', v_row.seller_name,
    'seller_address', v_row.seller_address,
    'seller_license', v_row.seller_license,
    'offers', (select coalesce(jsonb_agg(jsonb_build_object(
        'inventory_id', i.id, 'selling_price', i.selling_price, 'mrp', i.mrp, 'stock_qty', i.stock_qty, 'status', i.status,
        'max_order_qty', i.max_order_qty,
        'discount_pct', case when i.mrp > 0 then round(((i.mrp - i.selling_price)/i.mrp)*100) else 0 end
      )), '[]'::jsonb)
      from public.inventory i where i.product_id = v_p.id and i.is_active),
    'related', (select coalesce(jsonb_agg(to_jsonb(v) - 'tags'), '[]'::jsonb) from (
        select * from public.v_product_cards where category_id = v_p.category_id and id <> v_p.id and inventory_id is not null order by popularity_score desc limit 10) v),
    'frequently_bought', (select coalesce(jsonb_agg(to_jsonb(v) - 'tags'), '[]'::jsonb) from (
        select v.* from public.v_product_cards v join (
          select oi2.product_id, count(*) n from public.order_items oi1 join public.order_items oi2 on oi1.order_id = oi2.order_id and oi2.product_id <> oi1.product_id
          where oi1.product_id = v_p.id group by oi2.product_id order by n desc limit 8) f on f.product_id = v.id
        where v.inventory_id is not null) v),
    -- Same brand, in stock, most popular first (was a second search_products call from the page).
    'more_from_brand', (select coalesce(jsonb_agg(to_jsonb(v) - 'tags'), '[]'::jsonb) from (
        select * from public.v_product_cards where v_p.brand_id is not null and brand_id = v_p.brand_id and id <> v_p.id
          and inventory_id is not null and stock_status <> 'out_of_stock' order by popularity_score desc limit 12) v),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'title', r.title, 'comment', r.comment, 'created_at', r.created_at,
        'user_name', coalesce(pr.full_name, 'Customer')) order by r.created_at desc), '[]'::jsonb)
        from public.reviews r join public.profiles pr on pr.id = r.user_id where r.product_id = v_p.id and r.status = 'approved'),
    'in_wishlist', (auth.uid() is not null and exists (select 1 from public.wishlists w where w.user_id = auth.uid() and w.product_id = v_p.id))
  );
  return r;
end $$;
