import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import type { Product } from "@/types/app";
import { PAGE_SIZE, pageRange, safeLike, type Paged } from "./admin";

/* ================================================================================================
 * Admin catalogue reads (products, categories, brands, photo studio).
 * Every helper returns `error` instead of swallowing it, so pages can show ErrorBlock + Retry.
 * A product's selling price, stock and limits live on its single `inventory` row (its listing).
 * ============================================================================================== */

/* ------------------------------------------------------------------------------------------------
 * Products list
 * ---------------------------------------------------------------------------------------------- */

export type ProductTab = "" | "active" | "inactive" | "archived" | "all";
/** Default view is what's on sale; archived products (kept for order history) sit in their own tab. */
export const PRODUCT_TABS: { value: ProductTab; label: string }[] = [
  { value: "", label: "Live" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

export type ProductFilters = {
  q?: string; status?: string;
  /** Category id plus its subcategories (resolved by the page). */
  categoryIds?: string[];
  brand?: string; photo?: string;
  /** Listing state: in_stock | low_stock | out_of_stock | paused | unlisted. */
  stock?: string; sort?: string;
};

export const PRODUCT_SORTS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "popular", label: "Most popular" },
  { value: "updated", label: "Recently updated" },
] as const;

export type Listing = Pick<Tables<"inventory">, "id" | "product_id" | "selling_price" | "mrp" | "stock_qty" | "low_stock_threshold" | "max_order_qty" | "status" | "is_active" | "sold_count" | "updated_at">;
const LISTING_COLS = "id, product_id, selling_price, mrp, stock_qty, low_stock_threshold, max_order_qty, status, is_active, sold_count, updated_at";

export type CatalogueProductRow = Pick<Product, "id" | "name" | "slug" | "pack_label" | "mrp" | "image_url" | "is_active" | "is_local" | "is_veg" | "popularity_score" | "created_at" | "updated_at"> & {
  category: { name: string } | null; brand: { name: string } | null;
  /** The product's listing (price and stock), if it has one. */
  offer: Listing | null;
};

const PRODUCT_COLS = "id, name, slug, pack_label, mrp, image_url, is_active, is_local, is_veg, popularity_score, created_at, updated_at, category:categories(name), brand:brands(name)";
/** The listing rides along in the same query (PostgREST embed); `!inner` turns it into a filter for the stock tabs. */
const offerEmbed = (inner: boolean) => `, offer:inventory${inner ? "!inner" : ""}(${LISTING_COLS})`;
const unwrapOffer = (o: unknown): Listing | null => (Array.isArray(o) ? ((o[0] as Listing | undefined) ?? null) : ((o as Listing | null) ?? null));

/* The filters are applied to the list query and to each head-only tab count alike. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filterable = { eq: any; in: any; is: any; not: any; or: any };
function applyProductFilters<Q extends Filterable>(query: Q, f: ProductFilters, withStatus = true): Q {
  let q = query;
  if (withStatus) {
    if (!f.status || f.status === "active") q = q.eq("is_active", true);
    else if (f.status === "archived" || f.status === "inactive") q = q.eq("is_active", false);
    // "all": no status filter
  }
  if (f.categoryIds?.length) q = f.categoryIds.length === 1 ? q.eq("category_id", f.categoryIds[0]) : q.in("category_id", f.categoryIds);
  if (f.brand === "none") q = q.is("brand_id", null);
  else if (f.brand) q = q.eq("brand_id", f.brand);
  if (f.photo === "1") q = q.not("image_url", "is", null);
  if (f.photo === "0") q = q.is("image_url", null);
  if (f.stock && f.stock !== "unlisted") {
    if (f.stock === "paused") q = q.eq("offer.is_active", false);
    else q = q.eq("offer.status", f.stock).eq("offer.is_active", true);
  }
  if (f.q) { const like = safeLike(f.q); q = q.or(`name.ilike.${like},slug.ilike.${like},pack_label.ilike.${like}`); }
  return q;
}

/** A stock filter needs an inner join on the listing; "unlisted" needs products with no listing at all. */
function stockJoin(f: ProductFilters) {
  if (!f.stock) return "";
  return f.stock === "unlisted" ? ", offer:inventory(id)" : ", offer:inventory!inner(id)";
}

/** One query: the page of products with each one's listing embedded (no second lookup). */
export async function listCatalogueProducts(f: ProductFilters & { page?: number }): Promise<Paged<CatalogueProductRow> & { error: string | null }> {
  const supabase = await createClient();
  const page = f.page ?? 1;
  const select = PRODUCT_COLS + offerEmbed(Boolean(f.stock) && f.stock !== "unlisted");
  let base = supabase.from("products").select(select, { count: "exact" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  base = (f.sort === "name" ? base.order("name") : f.sort === "popular" ? base.order("popularity_score", { ascending: false }).order("name") : f.sort === "updated" ? base.order("updated_at", { ascending: false }) : base.order("created_at", { ascending: false })) as any;
  let q = applyProductFilters(base.range(...pageRange(page)), f);
  if (f.stock === "unlisted") q = q.is("offer", null);
  const { data, count, error } = await q;
  if (error) return { items: [], total: 0, page, pageSize: PAGE_SIZE, error: error.message };
  const rows = (data ?? []) as unknown as (Omit<CatalogueProductRow, "offer"> & { offer: unknown })[];
  return { items: rows.map((p) => ({ ...p, offer: unwrapOffer(p.offer) })), total: count ?? 0, page, pageSize: PAGE_SIZE, error: null };
}

/** Head-only counts per status tab, honouring search and the other filters. */
export async function countProductTabs(f: ProductFilters): Promise<Record<string, number | null>> {
  const supabase = await createClient();
  const select = "id" + stockJoin(f);
  const res = await Promise.all(PRODUCT_TABS.map(async (t) => {
    let q = applyProductFilters(supabase.from("products").select(select, { count: "exact", head: true }), { ...f, status: t.value });
    if (f.stock === "unlisted") q = q.is("offer", null);
    const r = await q;
    return [t.value, r.error ? null : r.count ?? 0] as const;
  }));
  return Object.fromEntries(res);
}

/* ------------------------------------------------------------------------------------------------
 * Product detail
 * ---------------------------------------------------------------------------------------------- */

export type StockMovement = Pick<Tables<"inventory_movements">, "id" | "inventory_id" | "delta" | "reason" | "note" | "created_at"> & { actor: { full_name: string | null } | null };

export type ProductDetail = {
  product: Product;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  listing: Listing | null;
  movements: StockMovement[];
};

export async function getCatalogueProduct(id: string): Promise<{ data: ProductDetail | null; error: string | null }> {
  const supabase = await createClient();
  const { data: product, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!product) return { data: null, error: null };
  const [listing, category, brand] = await Promise.all([
    supabase.from("inventory").select(LISTING_COLS).eq("product_id", id).maybeSingle(),
    supabase.from("categories").select("id, name").eq("id", product.category_id).maybeSingle(),
    product.brand_id ? supabase.from("brands").select("id, name").eq("id", product.brand_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (listing.error) return { data: null, error: listing.error.message };
  let movements: StockMovement[] = [];
  if (listing.data) {
    const m = await supabase.from("inventory_movements").select("id, inventory_id, delta, reason, note, created_at, actor:profiles(full_name)").eq("inventory_id", listing.data.id).order("created_at", { ascending: false }).limit(12);
    movements = (m.data ?? []) as unknown as StockMovement[];
  }
  return {
    data: { product: product as Product, category: category.data ?? null, brand: brand.data ?? null, listing: (listing.data as Listing | null) ?? null, movements },
    error: null,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Categories / brands
 * ---------------------------------------------------------------------------------------------- */

export type CategoryRow = Tables<"categories">;

export async function getCategoriesWithCounts(): Promise<{ categories: CategoryRow[]; counts: Record<string, number>; error: string | null }> {
  const supabase = await createClient();
  const [cats, prods] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order").order("name"),
    supabase.from("products").select("category_id"),
  ]);
  const error = cats.error?.message ?? prods.error?.message ?? null;
  const counts: Record<string, number> = {};
  for (const r of prods.data ?? []) counts[r.category_id] = (counts[r.category_id] ?? 0) + 1;
  return { categories: (cats.data ?? []) as CategoryRow[], counts, error };
}

export type BrandRow = Tables<"brands">;

export async function listCatalogueBrands(f: { q?: string; status?: string; page?: number }): Promise<Paged<BrandRow & { products: number }> & { error: string | null; counts: Record<string, number | null> }> {
  const supabase = await createClient();
  const page = f.page ?? 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter = <Q extends { eq: any; or: any }>(query: Q, withStatus = true): Q => {
    let q = query;
    if (withStatus && f.status === "active") q = q.eq("is_active", true);
    if (withStatus && f.status === "inactive") q = q.eq("is_active", false);
    if (f.q) { const like = safeLike(f.q); q = q.or(`name.ilike.${like},slug.ilike.${like}`); }
    return q;
  };
  const [list, all, active, inactive] = await Promise.all([
    filter(supabase.from("brands").select("*", { count: "exact" }).order("name").range(...pageRange(page))),
    filter(supabase.from("brands").select("id", { count: "exact", head: true }), false),
    filter(supabase.from("brands").select("id", { count: "exact", head: true }).eq("is_active", true), false),
    filter(supabase.from("brands").select("id", { count: "exact", head: true }).eq("is_active", false), false),
  ]);
  const counts = { "": all.error ? null : all.count ?? 0, active: active.error ? null : active.count ?? 0, inactive: inactive.error ? null : inactive.count ?? 0 };
  if (list.error) return { items: [], total: 0, page, pageSize: PAGE_SIZE, error: list.error.message, counts };
  const brands = (list.data ?? []) as BrandRow[];
  const perBrand: Record<string, number> = {};
  if (brands.length) {
    const p = await supabase.from("products").select("brand_id").in("brand_id", brands.map((b) => b.id));
    for (const r of p.data ?? []) if (r.brand_id) perBrand[r.brand_id] = (perBrand[r.brand_id] ?? 0) + 1;
  }
  return { items: brands.map((b) => ({ ...b, products: perBrand[b.id] ?? 0 })), total: list.count ?? 0, page, pageSize: PAGE_SIZE, error: null, counts };
}

/* ------------------------------------------------------------------------------------------------
 * Photo studio
 * ---------------------------------------------------------------------------------------------- */

export type PhotoRow = { id: string; name: string; slug: string; pack_label: string | null; image_url: string | null; images: string[]; brand: { name: string } | null; category: { name: string } | null };
export type PhotoFilters = { q?: string; have?: string; categoryIds?: string[]; brand?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyPhotoFilters<Q extends { eq: any; in: any; is: any; not: any; or: any }>(query: Q, f: PhotoFilters, withHave = true): Q {
  let q = query.eq("is_active", true);
  if (withHave) {
    if (f.have === "1") q = q.not("image_url", "is", null);
    else if (f.have !== "all") q = q.is("image_url", null);
  }
  if (f.categoryIds?.length) q = f.categoryIds.length === 1 ? q.eq("category_id", f.categoryIds[0]) : q.in("category_id", f.categoryIds);
  if (f.brand) q = q.eq("brand_id", f.brand);
  if (f.q) { const like = safeLike(f.q); q = q.or(`name.ilike.${like},slug.ilike.${like}`); }
  return q;
}

/** Active products split by whether they have a photo, most popular first, plus tab counts and coverage. */
export async function listPhotoStudio(f: PhotoFilters & { page?: number }) {
  const supabase = await createClient();
  const page = f.page ?? 1;
  const head = () => supabase.from("products").select("id", { count: "exact", head: true });
  const [list, missing, have, all, coverageWith, coverageAll] = await Promise.all([
    applyPhotoFilters(supabase.from("products").select("id, name, slug, pack_label, image_url, images, brand:brands(name), category:categories(name)", { count: "exact" }).order("popularity_score", { ascending: false }).order("name").range(...pageRange(page)), f),
    applyPhotoFilters(head(), { ...f, have: "0" }),
    applyPhotoFilters(head(), { ...f, have: "1" }),
    applyPhotoFilters(head(), { ...f, have: "all" }),
    head().eq("is_active", true).not("image_url", "is", null),
    head().eq("is_active", true),
  ]);
  return {
    items: (list.data ?? []) as unknown as PhotoRow[], total: list.count ?? 0, page, pageSize: PAGE_SIZE,
    error: list.error?.message ?? null,
    counts: { "0": missing.count ?? null, "1": have.count ?? null, all: all.count ?? null } as Record<string, number | null>,
    withPhoto: coverageWith.count ?? 0, totalProducts: coverageAll.count ?? 0,
  };
}

/** Category id plus its direct subcategories (the tree is two levels deep). */
export function withSubcategories(categories: { id: string; parent_id: string | null }[], id: string) {
  if (!id) return undefined;
  return [id, ...categories.filter((c) => c.parent_id === id).map((c) => c.id)];
}
