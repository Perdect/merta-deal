import type { MetadataRoute } from "next";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { env, isSupabaseConfigured } from "@/lib/env";
import { site } from "@/config/site";
import { SERVICE_LINKS } from "@/lib/service-pages";
import { publishedForSitemap } from "@/lib/data/directory";
import { DIRECTORY, profilePath } from "@/lib/directory";

export const dynamic = "force-dynamic";

/**
 * Server-side anon client without request cookies: the sitemap only reads public catalogue rows (RLS allows anon),
 * and skipping `cookies()` keeps the route free of per-visitor state. It is generated on every request: the
 * catalogue is small (under 100 URLs) and the earlier hourly ISR copy was found serving a two-week-old list.
 */
function catalogueClient() {
  if (!isSupabaseConfigured()) return null;
  return createSupabaseClient<Database>(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Only canonical, indexable URLs: no redirects, no noindex pages (search, assistant, track, start),
 * no private areas, no filter/sort variants. Products come from `v_product_cards`, the same view the
 * product page renders, so every listed product URL returns 200; categories are listed only when
 * they are active and have at least one product.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = site.url;
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/` },
    { url: `${base}/categories` },
    { url: `${base}/about` },
    { url: `${base}/delivery-area` },
    { url: `${base}/deliver` },
    ...SERVICE_LINKS.map((l) => ({ url: `${base}${l.href}` })),
    { url: `${base}/list-your-business` },
    { url: `${base}/terms` },
    { url: `${base}/privacy` },
  ];

  // Directories join the sitemap with their first published profile; an empty one is noindex.
  const profiles = await publishedForSitemap().catch(() => []);
  for (const category of new Set(profiles.map((b) => b.category))) entries.push({ url: `${base}${DIRECTORY[category].path}` });
  for (const b of profiles) entries.push({ url: `${base}${profilePath(b)}`, lastModified: new Date(b.updated_at) });

  const supabase = catalogueClient();
  if (!supabase) return entries;
  try {
    const [categories, cards] = await Promise.all([
      supabase.from("categories").select("id, slug, parent_id, updated_at").eq("is_active", true).limit(500),
      supabase.from("v_product_cards").select("slug, category_id").not("inventory_id", "is", null).limit(5000),
    ]);
    const cats = categories.data ?? [];
    const withProducts = new Set<string>();
    const parentOf = new Map(cats.map((c) => [c.id, c.parent_id]));
    for (const p of cards.data ?? []) {
      if (!p.category_id) continue;
      withProducts.add(p.category_id);
      const parent = parentOf.get(p.category_id);
      if (parent) withProducts.add(parent);
    }
    for (const c of cats) if (withProducts.has(c.id)) entries.push({ url: `${base}/c/${c.slug}`, lastModified: c.updated_at ? new Date(c.updated_at) : undefined });
    const { data: products } = await supabase.from("products").select("slug, updated_at").in("slug", (cards.data ?? []).map((p) => p.slug as string).filter(Boolean)).limit(5000);
    for (const p of products ?? []) entries.push({ url: `${base}/p/${p.slug}`, lastModified: p.updated_at ? new Date(p.updated_at) : undefined });
  } catch (err) {
    // Database unreachable: still serve the static part of the sitemap.
    console.error("sitemap", err instanceof Error ? err.message : err);
  }
  return entries;
}
