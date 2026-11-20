import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { getBrands, getCategories, getCategoryTabs, searchProducts } from "@/lib/data/catalog";
import { parseListingParams } from "@/lib/listing-params";
import { ProductListing } from "@/components/shop/product-listing";
import { SearchBar } from "@/components/shop/search-bar";
import { AppBar } from "@/components/shop/app-bar";
import { CategoryBand } from "@/components/shop/category-band";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams; const q = typeof sp.q === "string" ? sp.q : "";
  return { title: q ? `“${q}” — search results` : "Search products", robots: { index: false } };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const params = parseListingParams(sp);
  const [result, brands, categories, lines] = await Promise.all([searchProducts(params), getBrands(), getCategories(), getCategoryTabs()]);
  const q = params.q ?? "";
  // Search started from a category page stays inside that category (one slug or a grouped list).
  const scopeSlugs = params.category?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];
  const scopeName = scopeSlugs.length ? (categories.filter((c) => scopeSlugs.includes(c.slug)).map((c) => c.name).join(" & ") || "this category") : null;
  const scope = scopeName && params.category ? { slug: params.category, name: scopeName } : undefined;
  const everywhere = q ? `/search?q=${encodeURIComponent(q)}` : "/search";
  // A search kept inside one line shows that line as the current one in the band.
  const activeLine = scopeSlugs.length === 1 ? lines.find((l) => l.slug === scopeSlugs[0])?.slug : undefined;
  return (
    <div className="px-4 pt-3 sm:px-0">
      <AppBar back="/" cart className="-mt-3 mb-0"><div className="min-w-0 flex-1"><SearchBar compact initial={q} autoFocus={!q} scope={scope} /></div></AppBar>
      {/* The shop's lines, one tap away: somewhere to go from a search that found little or nothing. */}
      <CategoryBand lines={lines} active={activeLine} className="-mx-4 sm:mx-0" />
      <div className="mt-4 hidden lg:block"><SearchBar initial={q} autoFocus={!q} scope={scope} /></div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h1 className="min-w-0 font-display text-lg font-bold leading-tight text-ink sm:text-xl">{q ? <>Results for “{q}”{scopeName ? ` in ${scopeName}` : ""}</> : scopeName ? `Search in ${scopeName}` : "All products"}</h1>
        {scopeName ? <Link href={everywhere} className="tap inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand-300 bg-brand-50 px-3 text-xs font-semibold text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600" aria-label={`Remove ${scopeName} filter and search everywhere`}>In {scopeName} <X className="h-3.5 w-3.5" aria-hidden /></Link> : null}
      </div>
      <div className="mt-1">
        {/* The category filter stays in the Filters panel; the band above already names the lines. */}
        <ProductListing result={result} hideCategoryChips filters={{ brands, categories: categories.filter((c) => !c.parent_id).map((c) => ({ name: c.name, slug: c.slug })) }}
          emptyTitle={q ? `Nothing found for “${q}”${scopeName ? ` in ${scopeName}` : ""}` : "No products"} />
      </div>
    </div>
  );
}
