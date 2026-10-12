import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Enums, Tables } from "@/types/database";
import type { Product } from "@/types/app";
import { PAGE_SIZE, pageRange, safeLike, type Paged } from "./admin";

/* ================================================================================================
 * Admin catalogue reads (products, categories, brands, photo studio).
 * Every helper returns `error` instead of swallowing it, so pages can show ErrorBlock + Retry.
 * The catalogue (products) is shared; prices and stock live per store in `inventory`.
 * ============================================================================================== */

/** The store Merta Deal sells from directly (see migration 0018_direct_selling.sql). */
export const MAIN_STORE_SLUG = "merta-deal";

export type MainStore = { id: string; name: string; slug: string; status: Enums<"store_status"> };

export const getMainStore = cache(async (): Promise<MainStore | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("id, name, slug, status").eq("slug", MAIN_STORE_SLUG).maybeSingle();
  return (data as MainStore | null) ?? null;
});

/* ------------------------------------------------------------------------------------------------
 * Products list
 * ---------------------------------------------------------------------------------------------- */

export type ProductTab = "" | "active" | "inactive" | "archived" | "pending" | "all";
/** Default view is what's on sale; archived products (kept for order history) sit in their own tab. */
export const PRODUCT_TABS: { value: ProductTab; label: string }[] = [
  { value: "", label: "Live" },
  { value: "pending", label: "Awaiting approval" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

export type ProductFilters = {
  q?: string; status?: string;
  /** Category id plus its subcategories (resolved by the page). */
  categoryIds?: string[];
  brand?: string; origin?: string; photo?: string;
  /** Main-store offer state: in_stock | low_stock | out_of_stock | paused. */
  stock?: string; sort?: string;
};

export const PRODUCT_SORTS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "popular", label: "Most popular" },
  { value: "updated", label: "Recently updated" },
] as const;

export type StoreOffer = Pick<Tables<"inventory">, "id" | "store_id" | "product_id" | "selling_price" | "mrp" | "stock_qty" | "low_stock_threshold" | "max_order_qty" | "status" | "is_active" | "sold_count" | "updated_at">;
const OFFER_COLS = "id, store_id, product_id, selling_price, mrp, stock_qty, low_stock_threshold, max_order_qty, status, is_active, sold_count, updated_at";

export type CatalogueProductRow = Pick<Product, "id" | "name" | "slug" | "pack_label" | "mrp" | "image_url" | "is_active" | "is_approved" | "is_local" | "is_veg" | "popularity_score" | "created_at" | "updated_at" | "created_by_store_id"> & {
  category: { name: string } | null; brand: { name: string } | null;
  /** This product's offer at the main store, if listed there. */
  offer: StoreOffer | null;
};

const PRODUCT_COLS = "id, name, slug, pack_label, mrp, image_url, is_active, is_approved, is_local, is_veg, popularity_score, created_at, updated_at, created_by_store_id, category:categories(name), brand:brands(name)";

/* The filters are applied to the list query and to each head-only tab count alike. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filterable = { eq: any; in: any; is: any; not: any; or: any };
function applyProductFilters<Q extends Filterable>(query: Q, f: ProductFilters, mainStoreId: string | null, withStatus = true): Q {
  let q = query;
  if (withStatus) {
    if (!f.status || f.status === "active") q = q.eq("is_active", true);
    else if (f.status === "archived" || f.status === "inactive") q = q.eq("is_active", false);
    else if (f.status === "pending") q = q.eq("is_active", true).eq("is_approved", false);
    // "all": no status filter
  }
  if (f.categoryIds?.length) q = f.categoryIds.length === 1 ? q.eq("category_id", f.categoryIds[0]) : q.in("category_id", f.categoryIds);
  if (f.brand === "none") q = q.is("brand_id", null);
  else if (f.brand) q = q.eq("brand_id", f.brand);
  if (f.origin === "store") q = q.not("created_by_store_id", "is", null);
  if (f.origin === "catalogue") q = q.is("created_by_store_id", null);
  if (f.photo === "1") q = q.not("image_url", "is", null);
  if (f.photo === "0") q = q.is("image_url", null);
  if (f.stock && mainStoreId) {
    q = q.eq("offer.store_id", mainStoreId);
    if (f.stock === "paused") q = q.eq("offer.is_active", false);
    else q = q.eq("offer.status", f.stock).eq("offer.is_active", true);
  }
  if (f.q) { const like = safeLike(f.q); q = q.or(`name.ilike.${like},slug.ilike.${like},pack_label.ilike.${like}`); }
  return q;
}

/** A stock filter needs an inner join on the main store's inventory row. */
function stockJoin(f: ProductFilters, mainStoreId: string | null) {
  return f.stock && mainStoreId ? ", offer:inventory!inner(id)" : "";
}

export async function listCatalogueProducts(f: ProductFilters & { page?: number }): Promise<Paged<CatalogueProductRow> & { error: string | null; mainStore: MainStore | null }> {
  const supabase = await createClient();
  const page = f.page ?? 1;
  const mainStore = await getMainStore();
  const mainId = mainStore?.id ?? null;
  const select = PRODUCT_COLS + stockJoin(f, mainId);
  let base = supabase.from("products").select(select, { count: "exact" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  base = (f.sort === "name" ? base.order("name") : f.sort === "popular" ? base.order("popularity_score", { ascending: false }).order("name") : f.sort === "updated" ? base.order("updated_at", { ascending: false }) : base.order("created_at", { ascending: false })) as any;
  const { data, count, error } = await applyProductFilters(base.range(...pageRange(page)), f, mainId);
  if (error) return { items: [], total: 0, page, pageSize: PAGE_SIZE, error: error.message, mainStore };
  const rows = (data ?? []) as unknown as Omit<CatalogueProductRow, "offer">[];
  let offers: StoreOffer[] = [];
  if (mainId && rows.length) {
    const r = await supabase.from("inventory").select(OFFER_COLS).eq("store_id", mainId).in("product_id", rows.map((p) => p.id));
    if (r.error) return { items: [], total: 0, page, pageSize: PAGE_SIZE, error: r.error.message, mainStore };
    offers = (r.data ?? []) as StoreOffer[];
  }
  const byProduct = new Map(offers.map((o) => [o.product_id, o]));
  return { items: rows.map((p) => ({ ...p, offer: byProduct.get(p.id) ?? null })), total: count ?? 0, page, pageSize: PAGE_SIZE, error: null, mainStore };
}

/** Head-only counts per status tab, honouring search and the other filters. */
export async function countProductTabs(f: ProductFilters): Promise<Record<string, number | null>> {
  const supabase = await createClient();
  const mainId = (await getMainStore())?.id ?? null;
  const select = "id" + stockJoin(f, mainId);
  const res = await Promise.all(PRODUCT_TABS.map(async (t) => {
    const q = applyProductFilters(supabase.from("products").select(select, { count: "exact", head: true }), { ...f, status: t.value }, mainId);
    const r = await q;
    return [t.value, r.error ? null : r.count ?? 0] as const;
  }));
  return Object.fromEntries(res);
}

/* ------------------------------------------------------------------------------------------------
 * Product detail
 * ---------------------------------------------------------------------------------------------- */

export type OfferWithStore = StoreOffer & { store: { id: string; name: string; slug: string; area: string; status: Enums<"store_status"> } | null };
export type StockMovement = Pick<Tables<"inventory_movements">, "id" | "inventory_id" | "delta" | "reason" | "note" | "created_at"> & { actor: { full_name: string | null } | null };

export type ProductDetail = {
  product: Product;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  creator: { id: string; name: string } | null;
  offers: OfferWithStore[];
  movements: StockMovement[];
  mainStore: MainStore | null;
};

export async function getCatalogueProduct(id: string): Promise<{ data: ProductDetail | null; error: string | null }> {
  const supabase = await createClient();
  const { data: product, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!product) return { data: null, error: null };
  const [offers, category, brand, creator, mainStore] = await Promise.all([
    supabase.from("inventory").select(`${OFFER_COLS}, store:stores(id, name, slug, area, status)`).eq("product_id", id),
    supabase.from("categories").select("id, name").eq("id", product.category_id).maybeSingle(),
    product.brand_id ? supabase.from("brands").select("id, name").eq("id", product.brand_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    product.created_by_store_id ? supabase.from("stores").select("id, name").eq("id", product.created_by_store_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    getMainStore(),
  ]);
  if (offers.error) return { data: null, error: offers.error.message };
  const list = ((offers.data ?? []) as unknown as OfferWithStore[]).sort((a, b) =>
    Number(b.store?.slug === MAIN_STORE_SLUG) - Number(a.store?.slug === MAIN_STORE_SLUG) || Number(b.is_active) - Number(a.is_active) || (a.store?.name ?? "").localeCompare(b.store?.name ?? ""));
  let movements: StockMovement[] = [];
  if (list.length) {
    const m = await supabase.from("inventory_movements").select("id, inventory_id, delta, reason, note, created_at, actor:profiles(full_name)").in("inventory_id", list.map((o) => o.id)).order("created_at", { ascending: false }).limit(12);
    movements = (m.data ?? []) as unknown as StockMovement[];
  }
  return {
    data: { product: product as Product, category: category.data ?? null, brand: brand.data ?? null, creator: creator.data ?? null, offers: list, movements, mainStore },
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
