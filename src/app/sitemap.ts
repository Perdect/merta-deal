import type { MetadataRoute } from "next";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { env, isSupabaseConfigured } from "@/lib/env";
import { seoPages, site } from "@/config/site";

export const revalidate = 3600;

const PRODUCT_CAP = 5000;

/**
 * Server-side anon client without request cookies: the sitemap only reads public catalogue rows (RLS allows anon),
 * and skipping `cookies()` keeps this route statically cacheable (ISR, hourly) instead of hitting Postgres on every crawl.
 */
function catalogueClient() {
  if (!isSupabaseConfigured()) return null;
  return createSupabaseClient<Database>(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Sitemap: static routes, SEO landing pages, categories, stores and up to 5000 active products. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = site.url.replace(/\/$/, "");
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/categories`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/stores`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/search`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: `${base}/assistant`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/track`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/start`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    ...seoPages.map((p) => ({ url: `${base}/${p.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.9 })),
  ];

  const supabase = catalogueClient();
  if (!supabase) return entries;
  try {
    const [categories, stores, products] = await Promise.all([
      supabase.from("categories").select("slug, updated_at").eq("is_active", true).limit(500),
      supabase.from("stores").select("slug, updated_at").eq("status", "active").limit(1000),
      supabase.from("products").select("slug, updated_at").eq("is_active", true).order("updated_at", { ascending: false }).limit(PRODUCT_CAP),
    ]);
    for (const c of categories.data ?? []) entries.push({ url: `${base}/c/${c.slug}`, lastModified: c.updated_at ? new Date(c.updated_at) : now, changeFrequency: "daily", priority: 0.8 });
    for (const s of stores.data ?? []) entries.push({ url: `${base}/s/${s.slug}`, lastModified: s.updated_at ? new Date(s.updated_at) : now, changeFrequency: "daily", priority: 0.7 });
    for (const p of products.data ?? []) entries.push({ url: `${base}/p/${p.slug}`, lastModified: p.updated_at ? new Date(p.updated_at) : now, changeFrequency: "weekly", priority: 0.6 });
  } catch (err) {
    // Database unreachable: still serve the static part of the sitemap.
    console.error("sitemap", err instanceof Error ? err.message : err);
  }
  return entries;
}
