import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ProductCard } from "@/types/app";

/** Launch staples shown first under "Everyday essentials". Override with the `home_essentials` setting (JSON array of slugs). */
export const DEFAULT_ESSENTIALS = [
  "potato-aloo-1-kg", "onion-pyaz-1-kg", "tomato-tamatar-1-kg", "banana-kela-1-dozen",
  "aashirvaad-shudh-chakki-atta-5-kg", "tata-sampann-toor-dal-arhar-1-kg", "fortune-sunlite-refined-sunflower-oil-1-l", "fortune-everyday-basmati-rice-1-kg",
];
/** Transparent cut-outs used to compose each category tile (falls back to the category's best sellers). */
const TILE_PRODUCTS: Record<string, string[]> = {
  grocery: ["aashirvaad-shudh-chakki-atta-5-kg", "fortune-sunlite-refined-sunflower-oil-1-l"],
  fruits: ["banana-kela-1-dozen", "pomegranate-anar-500-g"],
  vegetables: ["onion-pyaz-1-kg", "potato-aloo-1-kg"],
};
const SECTION_SIZE = 6;

/** `cover` = the category's own image (set in admin), shown alone; otherwise two product cut-outs. */
export type HomeCategory = { id: string; name: string; slug: string; color: string | null; images: string[]; cover: boolean };
export type WelcomeOffer = { code: string; title: string; discount: number; isPercent: boolean; minOrder: number; maxDiscount: number | null; expiresAt: string | null };
export type HomeSection = { key: string; title: string; href: string | null; products: ProductCard[] };
export type HomeData = { categories: HomeCategory[]; sections: HomeSection[]; offers: WelcomeOffer[] };

/**
 * Everything the homepage needs in one concurrent batch: top-level categories, the sellable catalogue
 * (small at launch — one query, ranked by popularity), and the welcome coupon if it is live.
 * Each product appears in at most one section, so a small catalogue never looks repetitive.
 */
export const getHomeData = cache(async (essentialSlugs: string[], welcomeCode: string): Promise<HomeData> => {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [cats, cards, coupon] = await Promise.all([
    supabase.from("categories").select("id, name, slug, color, image_url, parent_id, sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("v_product_cards").select("*").not("inventory_id", "is", null).order("popularity_score", { ascending: false }).limit(150),
    // Every live coupon (the welcome code is shown first).
    supabase.from("coupons").select("code, title, type, value, min_order_amount, max_discount, expires_at, usage_limit, used_count")
      .eq("is_active", true).lte("starts_at", nowIso).order("min_order_amount").limit(10),
  ]);

  const allCats = cats.data ?? [];
  const top = allCats.filter((c) => !c.parent_id);
  const topOf = new Map<string, string>();
  for (const c of allCats) topOf.set(c.id, c.parent_id ?? c.id);
  const products = (cards.data ?? []) as unknown as ProductCard[];
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const sellable = (p: ProductCard | undefined): p is ProductCard => Boolean(p && p.stock_status !== "out_of_stock");
  const topSlugOf = (p: ProductCard) => top.find((c) => c.id === topOf.get(p.category_id))?.slug;

  const categories: HomeCategory[] = top.map((c) => {
    const curated = (TILE_PRODUCTS[c.slug] ?? []).map((s) => bySlug.get(s)?.image_url).filter(Boolean) as string[];
    const fallback = products.filter((p) => topSlugOf(p) === c.slug && p.image_url).map((p) => p.image_url as string);
    if (c.image_url) return { id: c.id, name: c.name, slug: c.slug, color: c.color, images: [c.image_url], cover: true };
    return { id: c.id, name: c.name, slug: c.slug, color: c.color, images: [...new Set([...curated, ...fallback])].slice(0, 2), cover: false };
  });

  // Pack-size variants share a name (Atta 5 kg / 10 kg), so de-duplicate by name, not only by id.
  const used = new Set<string>();
  const take = (list: ProductCard[]) => {
    const out: ProductCard[] = [];
    for (const p of list) {
      if (out.length >= SECTION_SIZE) break;
      const key = p.name.trim().toLowerCase();
      if (!used.has(key)) { out.push(p); used.add(key); }
    }
    return out;
  };
  const essentials = take([...essentialSlugs.map((s) => bySlug.get(s)).filter(sellable), ...products.filter((p) => sellable(p) && p.image_url)]);
  const inTop = (slug: string) => products.filter((p) => sellable(p) && topSlugOf(p) === slug).sort((a, b) => Number(Boolean(b.image_url)) - Number(Boolean(a.image_url)));
  const sections: HomeSection[] = [
    { key: "essentials", title: "Everyday essentials", href: null, products: essentials },
    { key: "vegetables", title: "Fresh vegetables", href: "/c/vegetables", products: take(inTop("vegetables")) },
    { key: "fruits", title: "Fresh fruits", href: "/c/fruits", products: take(inTop("fruits")) },
    { key: "grocery", title: "Grocery essentials", href: "/c/grocery", products: take(inTop("grocery")) },
  ].filter((s) => s.products.length);

  const offers: WelcomeOffer[] = (coupon.data ?? [])
    .filter((k) => (!k.expires_at || k.expires_at > nowIso) && (k.usage_limit == null || (k.used_count ?? 0) < k.usage_limit))
    .map((k) => ({ code: k.code, title: k.title, discount: Number(k.value), isPercent: k.type === "percentage", minOrder: Number(k.min_order_amount ?? 0), maxDiscount: k.max_discount == null ? null : Number(k.max_discount), expiresAt: k.expires_at }))
    .sort((a, b) => Number(b.code === welcomeCode) - Number(a.code === welcomeCode));

  return { categories, sections, offers };
});
