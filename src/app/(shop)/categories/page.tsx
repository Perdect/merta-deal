import type { Metadata } from "next";
import { getCategoryTabs, searchAllProducts } from "@/lib/data/catalog";
import { ShopPageHeader } from "@/components/shop/shop-page-header";
import { SearchLink } from "@/components/shop/search-link";
import { CategoryBrowser } from "@/components/shop/category-browser";

export const metadata: Metadata = { title: "Shop by Category – Grocery, Sweets, Cakes & Dry Fruits in Merta City", description: "Browse every MertaDeal category — grocery and kirana staples, sweets, cakes, bakery items and dry fruits — with home delivery in Merta City.", alternates: { canonical: "/categories" } };
export const dynamic = "force-dynamic";

/** Compact quick-commerce style category screen: tabs → sub-category tiles, or products for leaf categories. */
export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, tabs] = await Promise.all([searchParams, getCategoryTabs()]);
  // Categories without sub-categories show their products right on this screen.
  const leaf = tabs.filter((t) => t.tiles.length === 0);
  // Every product of the line is shown here: the owner asked for no "See all" step.
  const lists = await Promise.all(leaf.map((t) => searchAllProducts({ category: t.slug, sort: "popular" })));
  const products = Object.fromEntries(leaf.map((t, i) => [t.slug, { items: lists[i].items, total: lists[i].total }]));
  return (
    <div className="bg-card px-4 pb-6 pt-1 sm:rounded-2xl sm:px-5 lg:mt-4 lg:border lg:border-line lg:py-5">
      {/* No gap under the bar: the category band sits flush against it, as it does on the home. */}
      <ShopPageHeader title="Categories" barTitle="Categories" cart barClassName="-mt-1 mb-0" actions={<SearchLink />} className="px-0 lg:pb-3" />
      <CategoryBrowser tabs={tabs} initial={tab ?? tabs[0]?.slug ?? ""} products={products} />
    </div>
  );
}
