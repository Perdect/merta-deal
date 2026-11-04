import type { Metadata } from "next";
import { getCategoryTabs, searchProducts } from "@/lib/data/catalog";
import { getSessionUser } from "@/lib/supabase/server";
import { ShopPageHeader } from "@/components/shop/shop-page-header";
import { SearchLink } from "@/components/shop/search-link";
import { CategoryBrowser } from "@/components/shop/category-browser";

export const metadata: Metadata = { title: "Shop by Category – Grocery, Fruits & Vegetables in Merta City", description: "Browse every MertaDeal category — grocery and kirana staples, fresh vegetables and fruits — with home delivery across Merta City, Rajasthan.", alternates: { canonical: "/categories" } };
export const dynamic = "force-dynamic";

/** Compact quick-commerce style category screen: tabs → sub-category tiles, or products for leaf categories. */
export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, tabs, user] = await Promise.all([searchParams, getCategoryTabs(), getSessionUser()]);
  // Categories without sub-categories show their products right on this screen.
  const leaf = tabs.filter((t) => t.tiles.length === 0);
  const lists = await Promise.all(leaf.map((t) => searchProducts({ category: t.slug, sort: "popular", pageSize: 12 })));
  const products = Object.fromEntries(leaf.map((t, i) => [t.slug, { items: lists[i].items, total: lists[i].total }]));
  return (
    <div className="bg-card px-4 pb-6 pt-1 sm:rounded-2xl sm:px-5 lg:mt-4 lg:border lg:border-line lg:py-5">
      <ShopPageHeader title="Categories" barTitle="Categories" cart barClassName="-mt-1" actions={<SearchLink />} className="px-0 lg:pb-3" />
      <CategoryBrowser tabs={tabs} initial={tab ?? tabs[0]?.slug ?? ""} products={products} signedIn={Boolean(user)} />
    </div>
  );
}
