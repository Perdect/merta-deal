import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getCategories } from "@/lib/data/catalog";
import { ShopPageHeader } from "@/components/shop/shop-page-header";
import { SearchLink } from "@/components/shop/search-link";
import { DynamicIcon } from "@/components/shared/dynamic-icon";

export const metadata: Metadata = { title: "Shop by Category – Grocery, Fruits & Vegetables in Merta City", description: "Browse every MertaDeal category — grocery and kirana staples, fresh vegetables and fruits — with home delivery across Merta City, Rajasthan.", alternates: { canonical: "/categories" } };
export const revalidate = 300;

export default async function CategoriesPage() {
  const all = await getCategories();
  const parents = all.filter((c) => !c.parent_id);
  return (
    <div className="pt-1">
      <ShopPageHeader title="Shop by category" barTitle="Categories" cart barClassName="-mt-1" actions={<SearchLink />} subtitle="Grocery, fresh vegetables and fruits, delivered across Merta City" />
      <div className="grid gap-3 px-4 sm:grid-cols-2 sm:px-0 lg:grid-cols-3">
        {parents.map((p) => {
          const children = all.filter((c) => c.parent_id === p.id);
          return (
            <section key={p.id} className="rounded-lg border border-line bg-card p-4 shadow-card">
              <Link href={`/c/${p.slug}`} className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-md" style={{ backgroundColor: p.color ?? "#F1F9F1" }}><DynamicIcon name={p.icon} className="h-6 w-6 text-brand-700" /></span>
                <span className="flex-1"><span className="block text-base font-bold text-ink">{p.name}</span>{p.description ? <span className="block text-xs text-ink-3">{p.description}</span> : null}</span>
                <ChevronRight className="h-5 w-5 text-ink-4" />
              </Link>
              {children.length ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {children.map((c) => <li key={c.id}><Link href={`/c/${c.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-line-2 bg-surface px-3.5 text-[13px] font-medium text-ink-2 hover:border-brand-500 hover:text-brand-700">{c.name}</Link></li>)}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
