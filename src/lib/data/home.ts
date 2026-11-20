import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { unstable_cache } from "next/cache";
import { CATALOGUE_TAG } from "@/lib/data/catalog";
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
/**
 * Products selling below their MRP right now, one group per line of the shop.
 * `pct` is the biggest saving in the group and `images` are that group's own best-priced products, so a
 * deal tile can only ever say what a customer will find when they tap it.
 */
export type DealGroup = { key: string; name: string; href: string; pct: number; count: number; images: string[]; color: string | null; /** The line's own picture (Admin → Categories), drawn large on its tile. */ picture: string | null };
export type HomeData = { categories: HomeCategory[]; sections: HomeSection[]; offers: WelcomeOffer[]; deals: DealGroup[] };
/** A saving smaller than this is not called a deal. */
const DEAL_MIN_PCT = 5;

/**
 * Everything the homepage needs in one concurrent batch: top-level categories, the sellable catalogue
 * (small at launch — one query, ranked by popularity), and the welcome coupon if it is live.
 * Each product appears in at most one section, so a small catalogue never looks repetitive.
 */
const cachedHomeData = unstable_cache(async (essentialSlugs: string[], welcomeCode: string): Promise<HomeData> => {
  const supabase = createPublicClient();
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
  // Climb to the top-level line a product belongs to, however deep its category sits, so a product
  // filed under a sub-sub-category still appears in its parent line's row instead of silently nowhere.
  const parentOf = new Map(allCats.map((c) => [c.id, c.parent_id]));
  const topOf = new Map<string, string>();
  for (const c of allCats) {
    let id = c.id;
    for (let hop = 0; hop < 8; hop++) { const up = parentOf.get(id); if (!up) break; id = up; }
    topOf.set(c.id, id);
  }
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
    // Every other live top-level category gets its own row in catalogue order (Snacks, Sweets, and
    // Fruits / Vegetables if they are brought back), so a new line shows up here without a code change.
    ...top.filter((c) => c.slug !== "grocery").map((c) => ({
      key: c.slug, title: c.slug === "vegetables" ? "Fresh vegetables" : c.slug === "fruits" ? "Fresh fruits" : c.name, href: `/c/${c.slug}`, products: take(inTop(c.slug)),
    })),
    { key: "grocery", title: "Grocery essentials", href: "/c/grocery", products: take(inTop("grocery")) },
  ].filter((s) => s.products.length);

  const offers: WelcomeOffer[] = (coupon.data ?? [])
    .filter((k) => (!k.expires_at || k.expires_at > nowIso) && (k.usage_limit == null || (k.used_count ?? 0) < k.usage_limit))
    .map((k) => ({ code: k.code, title: k.title, discount: Number(k.value), isPercent: k.type === "percentage", minOrder: Number(k.min_order_amount ?? 0), maxDiscount: k.max_discount == null ? null : Number(k.max_discount), expiresAt: k.expires_at }))
    .sort((a, b) => Number(b.code === welcomeCode) - Number(a.code === welcomeCode));

  const onDeal = products.filter((p) => sellable(p) && Number(p.discount_pct ?? 0) >= DEAL_MIN_PCT).sort((a, b) => Number(b.discount_pct) - Number(a.discount_pct));
  const dealGroup = (key: string, name: string, href: string, color: string | null, picture: string | null, list: ProductCard[]): DealGroup | null => list.length
    ? { key, name, href, color, picture, pct: Math.round(Number(list[0].discount_pct)), count: list.length, images: [...new Set(list.map((p) => p.image_url).filter(Boolean) as string[])].slice(0, 3) }
    : null;
  const dealQuery = `sort=discount&minDiscount=${DEAL_MIN_PCT}&inStock=1`;
  const deals = top.map((c) => dealGroup(c.slug, c.name, `/c/${c.slug}?${dealQuery}`, c.color, c.image_url, onDeal.filter((p) => topSlugOf(p) === c.slug)))
    .filter((d): d is DealGroup => d !== null);

  return { categories, sections, offers, deals };
}, ["home-data"], { tags: [CATALOGUE_TAG, "coupons"], revalidate: 60 });
/** Served from the data cache for a minute: the home screen is the same for every visitor. */
export const getHomeData = cache((essentialSlugs: string[], welcomeCode: string) => cachedHomeData(essentialSlugs, welcomeCode));
