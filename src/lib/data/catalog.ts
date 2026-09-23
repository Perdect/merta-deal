import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Category, HomeFeed, NearbyStore, ProductCard, ProductDetail, SearchResult, Store } from "@/types/app";

export const getHomeFeed = cache(async (lat?: number | null, lng?: number | null): Promise<HomeFeed | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("home_feed", { p_lat: lat ?? undefined, p_lng: lng ?? undefined, p_limit: 12 });
  if (error) { console.error("home_feed", error.message); return null; }
  return data as unknown as HomeFeed;
});

export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").eq("is_active", true).order("sort_order");
  return (data ?? []) as Category[];
});

export const getCategoryBySlug = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").eq("slug", slug).maybeSingle();
  if (!data) return null;
  const { data: children } = await supabase.from("categories").select("*").eq("parent_id", data.id).eq("is_active", true).order("sort_order");
  const parent = data.parent_id ? (await supabase.from("categories").select("*").eq("id", data.parent_id).maybeSingle()).data : null;
  return { category: data as Category, children: (children ?? []) as Category[], parent: parent as Category | null };
});

export type SearchParams = { q?: string; category?: string; brands?: string[]; minPrice?: number; maxPrice?: number; minDiscount?: number; inStock?: boolean; storeId?: string; localOnly?: boolean; sort?: string; page?: number; pageSize?: number };

export async function searchProducts(p: SearchParams): Promise<SearchResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_products", {
    p_query: p.q || undefined, p_category_slug: p.category || undefined, p_brand_slugs: p.brands?.length ? p.brands : undefined,
    p_min_price: p.minPrice, p_max_price: p.maxPrice, p_min_discount: p.minDiscount, p_in_stock: p.inStock ?? false,
    p_store_id: p.storeId, p_local_only: p.localOnly ?? false, p_sort: p.sort ?? "relevance", p_page: p.page ?? 1, p_page_size: p.pageSize ?? 24,
  });
  if (error) { console.error("search_products", error.message); return { items: [], total: 0, page: 1, page_size: 24, has_more: false }; }
  return data as unknown as SearchResult;
}

export const getProductDetail = cache(async (slug: string): Promise<ProductDetail | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("product_detail", { p_slug: slug });
  if (error || !data) return null;
  return data as unknown as ProductDetail;
});

export const getBrands = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("id, name, slug").eq("is_active", true).order("name");
  return data ?? [];
});

export const getStoreBySlug = cache(async (slug: string): Promise<Store | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("*").eq("slug", slug).maybeSingle();
  return (data as Store) ?? null;
});

export const getNearbyStores = cache(async (lat: number, lng: number, radius = 15, limit = 30): Promise<NearbyStore[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("nearby_stores", { p_lat: lat, p_lng: lng, p_radius_km: radius, p_limit: limit });
  return (data ?? []) as NearbyStore[];
});

export const getStoreReviews = cache(async (storeId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("reviews").select("id, rating, title, comment, created_at, user_id").eq("store_id", storeId).eq("status", "approved").order("created_at", { ascending: false }).limit(20);
  return data ?? [];
});

export const getPublicSettings = cache(async (): Promise<Record<string, unknown>> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_settings");
  return (data as Record<string, unknown>) ?? {};
});

export const getWishlistIds = cache(async (): Promise<Set<string>> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase.from("wishlists").select("product_id").eq("user_id", user.id);
  return new Set((data ?? []).map((w) => w.product_id));
});

export async function getProductsByIds(ids: string[]): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("v_product_cards").select("*").in("id", ids);
  return (data ?? []) as ProductCard[];
}

/** Curated collections shown on the home screen (from `promotions` + quick-picks). */
export const getCollections = cache(async (): Promise<{ id: string; title: string; description: string | null; href: string; kind: string }[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("promotions").select("id, title, description, promo_type, category_id, product_ids, categories:categories(slug)").eq("is_active", true).order("sort_order").limit(8);
  const promos = (data ?? []).map((p) => {
    const cat = (p.categories as unknown as { slug: string } | null)?.slug;
    return { id: p.id, title: p.title, description: p.description, kind: p.promo_type === "flash_sale" ? "Flash sale" : "Collection", href: cat ? `/c/${cat}` : "/search?sort=popular" };
  });
  const quick = [
    { id: "chai-time", title: "Chai time", description: "Tea, biscuits, namkeen for 4 pm", kind: "Quick pick", href: "/search?q=tea%20biscuits%20namkeen" },
    { id: "breakfast", title: "Breakfast basket", description: "Milk, bread, butter, poha, eggs", kind: "Quick pick", href: "/search?q=milk%20butter%20poha" },
    { id: "monthly", title: "Monthly ration", description: "Atta, dal, rice, oil, sugar, salt", kind: "Quick pick", href: "/c/grocery?sort=popular" },
  ];
  return [...promos, ...quick].slice(0, 8);
});
