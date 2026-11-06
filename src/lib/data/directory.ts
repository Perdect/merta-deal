import { cache } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { env, isSupabaseConfigured } from "@/lib/env";
import type { Business, BusinessCategory, ListingRequest, MenuItem } from "@/lib/directory";

type Res<T> = PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>;
/** These tables arrive with migration 0040 and are not in the generated types until they are regenerated. */
export type Q<T> = Res<T[]> & { select: (c: string) => Q<T>; eq: (k: string, v: unknown) => Q<T>; order: (k: string, o?: { ascending: boolean }) => Q<T>; maybeSingle: () => Res<T>; limit: (n: number) => Q<T> };
type Db = { from: <T>(t: string) => Q<T> };

const db = async () => (await createClient()) as unknown as Db;

/** Published profiles of one category: paid placements first and labelled on the page. An unapplied migration reads as empty. */
export const listBusinesses = cache(async (category: BusinessCategory): Promise<Business[]> => {
  const { data, error } = await (await db()).from<Business>("local_businesses").select("*").eq("category", category).eq("status", "published").order("is_paid_placement", { ascending: false }).order("name");
  if (error && error.code !== "PGRST205" && error.code !== "42P01") console.error("local_businesses", error.message);
  return (data ?? []).filter((b) => !b.duplicate_of);
});

export const getBusiness = cache(async (category: BusinessCategory, slug: string): Promise<Business | null> => {
  const { data } = await (await db()).from<Business>("local_businesses").select("*").eq("category", category).eq("slug", slug).eq("status", "published").maybeSingle();
  return data && !data.duplicate_of ? data : null;
});

export const getMenu = cache(async (businessId: string): Promise<MenuItem[]> => {
  const { data } = await (await db()).from<MenuItem>("business_menu_items").select("*").eq("business_id", businessId).order("sort_order");
  return data ?? [];
});

/** For the sitemap: public rows only, no cookies, so the route stays free of visitor state. */
export async function publishedForSitemap(): Promise<Pick<Business, "slug" | "category" | "updated_at">[]> {
  if (!isSupabaseConfigured()) return [];
  const client = createSupabaseClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as Db;
  const { data } = await client.from<Business>("local_businesses").select("slug, category, updated_at, duplicate_of").eq("status", "published").limit(2000);
  return (data ?? []).filter((b) => !b.duplicate_of);
}

/* Admin (RLS gives admins every row) */
export async function adminListBusinesses() {
  const { data, error } = await (await db()).from<Business>("local_businesses").select("*").order("updated_at", { ascending: false }).limit(500);
  return { items: data ?? [], notInstalled: error?.code === "PGRST205" || error?.code === "42P01", error: Boolean(error) };
}
export async function adminListRequests() {
  const { data } = await (await db()).from<ListingRequest>("business_listing_requests").select("*").order("created_at", { ascending: false }).limit(200);
  return data ?? [];
}
export async function adminGetBusiness(id: string) {
  const client = await db();
  const [{ data: business }, { data: menu }] = await Promise.all([client.from<Business>("local_businesses").select("*").eq("id", id).maybeSingle(), client.from<MenuItem>("business_menu_items").select("*").eq("business_id", id).order("sort_order")]);
  return { business, menu: menu ?? [] };
}
