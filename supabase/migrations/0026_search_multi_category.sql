-- ============================================================================
-- MERTA DEAL — Category tiles can cover more than one category.
-- search_products(p_category_slug) now also accepts a comma-separated list ("dal,pulses"), so the
-- Categories screen can group overlapping catalogue categories into one tile without changing data.
-- Single slugs behave exactly as before. Same signature as 0025, so callers are unaffected.
-- ============================================================================
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
  if p_category_slug is not null then
    -- One slug or a comma-separated list (e.g. "dal,pulses" for a grouped tile); each includes its children.
    select array_agg(id) into v_cat_ids from public.categories
    where slug = any(string_to_array(replace(p_category_slug, ' ', ''), ','))
       or parent_id in (select id from public.categories where slug = any(string_to_array(replace(p_category_slug, ' ', ''), ',')));
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
      -- Shoppers only see products a store currently offers; the store "Add from catalog" picker asks for all.
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
