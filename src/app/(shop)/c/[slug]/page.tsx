import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getBrands, getCategoryBySlug, getWishlistIds, searchProducts } from "@/lib/data/catalog";
import { parseListingParams } from "@/lib/listing-params";
import { ProductListing } from "@/components/shop/product-listing";
import { PageHeader } from "@/components/ui/misc";
import { site } from "@/config/site";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCategoryBySlug(slug);
  if (!data) return {};
  const title = `${data.category.name} online in ${site.city}`;
  return { title, description: `Buy ${data.category.name.toLowerCase()} from trusted kirana stores in ${site.city}. Fast local delivery, honest prices, Hindi-friendly search.`, alternates: { canonical: `/c/${slug}` }, openGraph: { title, url: `/c/${slug}` } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params; const sp = await searchParams;
  const data = await getCategoryBySlug(slug);
  if (!data) notFound();
  const { category, children, parent } = data;
  const listingParams = parseListingParams(sp, { category: sp.category ? String(sp.category) : slug });
  const [user, result, brands, wished] = await Promise.all([getSessionUser(), searchProducts(listingParams), getBrands(), getWishlistIds()]);
  const jsonLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: category.name, url: `${site.url}/c/${slug}`, isPartOf: { "@type": "WebSite", name: site.name, url: site.url } };

  return (
    <div className="px-4 pt-1 sm:px-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="mt-2 text-xs text-ink-3"><Link href="/categories" className="hover:text-brand-700">Categories</Link>{parent ? <> / <Link href={`/c/${parent.slug}`} className="hover:text-brand-700">{parent.name}</Link></> : null} / <span className="text-ink">{category.name}</span></nav>
      <PageHeader title={category.name} subtitle={category.description ?? `${result.total} products from Merta kirana stores`} className="px-0" />
      {children.length ? (
        <div className="scroll-x -mx-4 mb-3 px-4 sm:mx-0 sm:px-0">
          {children.map((c) => <Link key={c.id} href={`/c/${c.slug}`} className="rounded-full border border-line-2 bg-card px-3.5 py-2 text-sm font-medium text-ink-2 hover:border-brand-500 hover:text-brand-700">{c.name}</Link>)}
        </div>
      ) : null}
      <ProductListing result={result} filters={{ brands, categories: children.map((c) => ({ name: c.name, slug: c.slug })) }} signedIn={Boolean(user)} wished={wished} hideCategoryChips />
    </div>
  );
}
