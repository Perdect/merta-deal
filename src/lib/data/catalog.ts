import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { unstable_cache } from "next/cache";
import type { Category, HomeFeed, ProductCard, ProductDetail, SearchResult } from "@/types/app";

export const getHomeFeed = cache(async (lat?: number | null, lng?: number | null): Promise<HomeFeed | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("home_feed", { p_lat: lat ?? undefined, p_lng: lng ?? undefined, p_limit: 8 });
  if (error) { console.error("home_feed", error.message); return null; }
  return data as unknown as HomeFeed;
});

/**
 * Public catalogue reads are served from the Next data cache for a minute (per deployment, shared by
 * every visitor), so a signed-in page load only waits for that person's own rows. Admin actions clear
 * the tags when they change the catalogue or settings.
 */
export const CATALOGUE_TAG = "catalogue";
export const SETTINGS_TAG = "settings";
const PUBLIC_TTL = 60;

const cachedCategories = unstable_cache(async (): Promise<Category[]> => {
  const { data } = await createPublicClient().from("categories").select("*").eq("is_active", true).order("sort_order");
  return (data ?? []) as Category[];
}, ["categories"], { tags: [CATALOGUE_TAG], revalidate: PUBLIC_TTL });
export const getCategories = cache(() => cachedCategories());

/** Slugs of the categories customers can shop right now (switched-off ones are missing). */
export const getActiveCategorySlugs = cache(async (): Promise<Set<string>> => new Set((await getCategories()).map((c) => c.slug)));

/** Keeps only the shop links whose category is switched on; links outside /c/ pass through. */
export function liveShopLinks<T extends { href: string }>(links: T[], active: Set<string>): T[] {
  return links.filter((l) => { const m = /^\/c\/([^/?#]+)/.exec(l.href); return !m || active.has(m[1]); });
}

const cachedCategoryBySlug = unstable_cache(async (slug: string) => {
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("categories").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`category lookup failed: ${error.message}`);
  if (!data) {
    // RLS hides switched-off categories from customers. Their page should still say "not available
    // right now" rather than pretend the category never existed, so the name is read with the
    // service role (name and slug only); an unknown slug stays a real 404.
    const admin = createAdminClient();
    const { data: paused } = admin ? await admin.from("categories").select("*").eq("slug", slug).eq("is_active", false).maybeSingle() : { data: null };
    return paused ? { category: paused as Category, children: [] as Category[], parent: null as Category | null, hidden: true as const } : null;
  }
  // Sub-categories and the parent are independent lookups: one round trip, not two.
  const [{ data: children }, parentRes] = await Promise.all([
    supabase.from("categories").select("*").eq("parent_id", data.id).eq("is_active", true).order("sort_order"),
    data.parent_id ? supabase.from("categories").select("*").eq("id", data.parent_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { category: data as Category, children: (children ?? []) as Category[], parent: (parentRes.data as Category | null) ?? null, hidden: false as const };
}, ["category-by-slug"], { tags: [CATALOGUE_TAG], revalidate: PUBLIC_TTL });
export const getCategoryBySlug = cache((slug: string) => cachedCategoryBySlug(slug));

export type SearchParams = { q?: string; category?: string; brands?: string[]; minPrice?: number; maxPrice?: number; minDiscount?: number; inStock?: boolean; localOnly?: boolean; sort?: string; page?: number; pageSize?: number };

const cachedSearch = unstable_cache(async (p: SearchParams): Promise<SearchResult> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("search_products", {
    p_query: p.q || undefined, p_category_slug: p.category || undefined, p_brand_slugs: p.brands?.length ? p.brands : undefined,
    p_min_price: p.minPrice, p_max_price: p.maxPrice, p_min_discount: p.minDiscount, p_in_stock: p.inStock ?? false,
    p_local_only: p.localOnly ?? false, p_sort: p.sort ?? "relevance", p_page: p.page ?? 1, p_page_size: p.pageSize ?? 24,
  });
  // A failed query is reported as such (`error`), never shown to shoppers as "no products".
  if (error) { console.error("search_products", error.message); return { items: [], total: 0, page: p.page ?? 1, page_size: p.pageSize ?? 24, has_more: false, error: true }; }
  return data as unknown as SearchResult;
}, ["search-products"], { tags: [CATALOGUE_TAG], revalidate: PUBLIC_TTL });
/** Listing results are public and identical for every visitor, so they come from the data cache. */
export const searchProducts = (p: SearchParams) => cachedSearch(p);

/** Public and identical for every visitor (the RPC's `in_wishlist` is not used), so it comes from the data cache. */
const cachedProductDetail = unstable_cache(async (slug: string): Promise<ProductDetail | null> => {
  const { data, error } = await createPublicClient().rpc("product_detail", { p_slug: slug });
  // A database error must not look like "product removed" (a 404 tells search engines to drop the page);
  // throwing renders the error screen with a retry instead. Only a missing/inactive product is null.
  if (error) throw new Error(`product_detail failed: ${error.message}`);
  if (!data) return null;
  // One round trip: the RPC also carries seller details, shelf life and "more from this brand".
  return data as unknown as ProductDetail;
}, ["product-detail"], { tags: [CATALOGUE_TAG], revalidate: PUBLIC_TTL });
export const getProductDetail = cache((slug: string) => cachedProductDetail(slug));

const cachedBrands = unstable_cache(async () => {
  const { data } = await createPublicClient().from("brands").select("id, name, slug").eq("is_active", true).order("name");
  return data ?? [];
}, ["brands"], { tags: [CATALOGUE_TAG], revalidate: 300 });
export const getBrands = cache(() => cachedBrands());

const cachedPublicSettings = unstable_cache(async (): Promise<Record<string, unknown>> => {
  const { data } = await createPublicClient().rpc("public_settings");
  return (data as Record<string, unknown>) ?? {};
}, ["public-settings"], { tags: [SETTINGS_TAG], revalidate: PUBLIC_TTL });
export const getPublicSettings = cache(() => cachedPublicSettings());

export async function getProductsByIds(ids: string[]): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("v_product_cards").select("*").in("id", ids);
  return (data ?? []) as ProductCard[];
}

/** Curated collections shown on the home screen (from `promotions` + quick-picks). */
const cachedCollections = unstable_cache(async (): Promise<{ id: string; title: string; description: string | null; href: string; kind: string }[]> => {
  const supabase = createPublicClient();
  const { data } = await supabase.from("promotions").select("id, title, description, promo_type, category_id, product_ids, categories:categories(slug)").eq("is_active", true).order("sort_order").limit(8);
  const promos = (data ?? []).map((p) => {
    const cat = (p.categories as unknown as { slug: string } | null)?.slug;
    return { id: p.id, title: p.title, description: p.description, kind: p.promo_type === "flash_sale" ? "Flash sale" : "Collection", href: cat ? `/c/${cat}` : "/search?sort=popular" };
  });
  // Every quick pick must land on
  // products a customer can actually buy, never an empty search.
  const quick = [
    { id: "monthly", title: "Monthly ration", description: "Atta, dal, rice, oil, sugar, salt", kind: "Quick pick", href: "/c/grocery?sort=popular" },
    { id: "mithai", title: "Mithai box", description: "Kaju katli, rasgulla and more", kind: "Quick pick", href: "/c/sweets" },
    { id: "cakes", title: "Cakes to order", description: "Chocolate, butterscotch, red velvet", kind: "Quick pick", href: "/c/bakery-cakes" },
  ];
  // A quick pick for a switched-off category would land on a notice, not products.
  const active = new Set((await cachedCategories()).map((c) => c.slug));
  return liveShopLinks([...promos, ...quick], active).slice(0, 8);
}, ["collections"], { tags: [CATALOGUE_TAG], revalidate: PUBLIC_TTL });
export const getCollections = cache(() => cachedCollections());

/* Categories screen ------------------------------------------------------------------------- */

export type CategoryTile = { key: string; label: string; href: string; image: string | null; count: number };
export type CategoryTab = { id: string; slug: string; name: string; image: string | null; color: string | null; count: number; tiles: CategoryTile[] };

/**
 * Tiles that cover several overlapping catalogue categories (no data change: the link filters by all of
 * them via search_products' comma list). Grouped categories also take the first member's position.
 */
const TILE_GROUPS: Record<string, { slugs: string[]; label: string }[]> = {
  grocery: [{ slugs: ["dal", "pulses"], label: "Dal & Pulses" }],
};
/**
 * Tabs = active top-level categories (an empty one shows as "coming soon" so a new line like Beauty &
 * Personal Care is visible before its first product); tiles = their sub-categories with at least one
 * listed product. Both follow the catalogue's own `sort_order`, so Admin → Categories is the only place
 * the running order is set. Tile pictures come from the most popular listed product (approved catalogue
 * photos), falling back to the category's own image.
 */
const cachedCategoryTabs = unstable_cache(async (): Promise<CategoryTab[]> => {
  const supabase = createPublicClient();
  const [cats, cards] = await Promise.all([
    cachedCategories(),
    supabase.from("v_product_cards").select("category_id, image_url, popularity_score").not("inventory_id", "is", null).order("popularity_score", { ascending: false }).limit(2000),
  ]);
  if (cards.error) throw new Error(`category tiles failed: ${cards.error.message}`);
  const byCat = new Map<string, { count: number; image: string | null }>();
  for (const r of (cards.data ?? []) as { category_id: string | null; image_url: string | null }[]) {
    if (!r.category_id) continue;
    const cur = byCat.get(r.category_id) ?? { count: 0, image: null };
    cur.count += 1; if (!cur.image && r.image_url) cur.image = r.image_url;
    byCat.set(r.category_id, cur);
  }
  const parents = cats.filter((c) => !c.parent_id);
  return parents.map((p) => {
    const children = cats.filter((c) => c.parent_id === p.id);
    const stat = (id: string) => byCat.get(id) ?? { count: 0, image: null };
    const groups = TILE_GROUPS[p.slug] ?? [];
    const grouped = new Set(groups.flatMap((g) => g.slugs));
    const tiles: (CategoryTile & { sort: number })[] = [];
    for (const c of children) {
      if (grouped.has(c.slug)) continue;
      const s = stat(c.id);
      if (s.count > 0) tiles.push({ key: c.slug, label: c.name, href: `/c/${c.slug}`, image: s.image ?? c.image_url, count: s.count, sort: c.sort_order });
    }
    for (const g of groups) {
      const members = children.filter((c) => g.slugs.includes(c.slug));
      const count = members.reduce((n, c) => n + stat(c.id).count, 0);
      if (count === 0) continue;
      const live = members.filter((c) => stat(c.id).count > 0);
      // A group with only one non-empty member links straight to it.
      const href = live.length === 1 ? `/c/${live[0].slug}` : `/c/${p.slug}?category=${live.map((c) => c.slug).join(",")}`;
      tiles.push({ key: g.slugs.join("+"), label: g.label, href, image: live.map((c) => stat(c.id).image).find(Boolean) ?? null, count, sort: Math.min(...members.map((c) => c.sort_order)) });
    }
    tiles.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
    const own = stat(p.id);
    const count = own.count + children.reduce((n, c) => n + stat(c.id).count, 0);
    return { id: p.id, slug: p.slug, name: p.name, image: p.image_url ?? own.image, color: p.color, count, tiles: tiles.map((t) => ({ key: t.key, label: t.label, href: t.href, image: t.image, count: t.count })) };
  });
}, ["category-tabs"], { tags: [CATALOGUE_TAG], revalidate: PUBLIC_TTL });
export const getCategoryTabs = cache(() => cachedCategoryTabs());
