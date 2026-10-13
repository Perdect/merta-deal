import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getBrands, getCategories, getWishlistIds, searchProducts } from "@/lib/data/catalog";
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
  const [user, result, brands, categories, wished] = await Promise.all([getSessionUser(), searchProducts(params), getBrands(), getCategories(), getWishlistIds()]);
  const q = params.q ?? "";
  return (
    <div className="px-4 pt-3 sm:px-0">
      <AppBar back="/" cart className="-mt-3"><div className="min-w-0 flex-1"><SearchBar compact initial={q} autoFocus={!q} /></div></AppBar>
      <div className="hidden lg:block"><SearchBar initial={q} autoFocus={!q} /></div>
      <h1 className="text-lg font-bold text-ink sm:text-xl lg:mt-3">{q ? <>Results for “{q}”</> : "All products"}</h1>
      <div className="mt-2">
        <ProductListing result={result} filters={{ brands, categories: categories.filter((c) => !c.parent_id).map((c) => ({ name: c.name, slug: c.slug })) }} signedIn={Boolean(user)} wished={wished}
          emptyTitle={q ? `Nothing found for “${q}”` : "No products"} />
      </div>
    </div>
  );
}
