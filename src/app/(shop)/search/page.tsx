import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { getBrands, getCategories, searchProducts } from "@/lib/data/catalog";
import { parseListingParams } from "@/lib/listing-params";
import { ProductListing } from "@/components/shop/product-listing";
import { SearchBar } from "@/components/shop/search-bar";
import { AppBar } from "@/components/shop/app-bar";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams; const q = typeof sp.q === "string" ? sp.q : "";
  return { title: q ? `“${q}” — search results` : "Search products", robots: { index: false } };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const params = parseListingParams(sp);
  const [result, brands, categories] = await Promise.all([searchProducts(params), getBrands(), getCategories()]);
  const q = params.q ?? "";
  // Search started from a category page stays inside that category (one slug or a grouped list).
  const scopeSlugs = params.category?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];
  const scopeName = scopeSlugs.length ? (categories.filter((c) => scopeSlugs.includes(c.slug)).map((c) => c.name).join(" & ") || "this category") : null;
  const scope = scopeName && params.category ? { slug: params.category, name: scopeName } : undefined;
  const everywhere = q ? `/search?q=${encodeURIComponent(q)}` : "/search";
  return (
    <div className="px-4 pt-3 sm:px-0">
      <AppBar back="/" cart className="-mt-3"><div className="min-w-0 flex-1"><SearchBar compact initial={q} autoFocus={!q} scope={scope} /></div></AppBar>
      <div className="hidden lg:block"><SearchBar initial={q} autoFocus={!q} scope={scope} /></div>
      <h1 className="text-lg font-bold text-ink sm:text-xl lg:mt-3">{q ? <>Results for “{q}”{scopeName ? ` in ${scopeName}` : ""}</> : scopeName ? `Search in ${scopeName}` : "All products"}</h1>
      {scopeName ? <Link href={everywhere} className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand-300 bg-brand-50 px-3 text-xs font-semibold text-brand-800" aria-label={`Remove ${scopeName} filter and search everywhere`}>In {scopeName} <X className="h-3.5 w-3.5" aria-hidden /></Link> : null}
      <div className="mt-2">
        <ProductListing result={result} filters={{ brands, categories: categories.filter((c) => !c.parent_id).map((c) => ({ name: c.name, slug: c.slug })) }}
          emptyTitle={q ? `Nothing found for “${q}”${scopeName ? ` in ${scopeName}` : ""}` : "No products"} />
      </div>
    </div>
  );
}
