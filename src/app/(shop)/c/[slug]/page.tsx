import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrands, getCategoryBySlug, getCategoryTabs, getPublicSettings, searchProducts, type CategoryTab } from "@/lib/data/catalog";
import { paymentPhrase } from "@/lib/seo-copy";
import { parseListingParams } from "@/lib/listing-params";
import { ProductListing } from "@/components/shop/product-listing";
import { ShopPageHeader } from "@/components/shop/shop-page-header";
import { SearchLink } from "@/components/shop/search-link";
import { CategoryBand } from "@/components/shop/category-band";
import { site } from "@/config/site";
import { CATEGORY_SEO, LISTING_FILTER_KEYS } from "@/config/seo";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params; const sp = await searchParams;
  const [data, settings] = await Promise.all([getCategoryBySlug(slug), getPublicSettings()]);
  if (!data) notFound(); // during metadata, so crawlers get a real 404 status, not a soft 404
  const seo = CATEGORY_SEO[slug];
  const name = data.category.name;
  if (data.hidden) return { title: `${name} – not available right now`, robots: { index: false, follow: true } };
  const title = seo?.title ?? `${name} Online in ${site.city}`;
  const pay = paymentPhrase(settings);
  const description = `${seo?.description ?? `Buy ${name.toLowerCase()} online in ${site.city}, Rajasthan${data.category.description ? ` — ${data.category.description.toLowerCase()}` : ""}. Home delivery from ${site.seoName}.`}${pay ? ` ${pay}` : ""}`;
  // Filtered/sorted variants are useful to shoppers but duplicate the listing: keep them out of the
  // index (still followed). Page 2+ is its own indexable page with a self-referencing canonical.
  const filtered = LISTING_FILTER_KEYS.some((k) => sp[k] != null && sp[k] !== "");
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
  const canonical = page > 1 && !filtered ? `/c/${slug}?page=${page}` : `/c/${slug}`;
  return {
    title: page > 1 ? `${title} – Page ${page}` : title,
    description,
    alternates: { canonical },
    robots: filtered ? { index: false, follow: true } : undefined,
    openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", title, description, url: `/c/${slug}`, images: data.category.image_url ? [{ url: data.category.image_url, alt: name }] : undefined },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params; const sp = await searchParams;
  const data = await getCategoryBySlug(slug);
  if (!data) notFound();
  if (data.hidden) return <HiddenCategory name={data.category.name} lines={await getCategoryTabs()} />;
  const { category, children, parent } = data;
  // A grouped tile (e.g. ?category=dal,pulses) narrows to those sub-categories and titles the bar with them.
  // Only this category's own sub-categories are honoured, so /c/grocery?category=fruits can't show fruit.
  const picked = String(sp.category ?? "").split(",").map((x) => x.trim()).filter((x) => children.some((c) => c.slug === x));
  const pickedNames = children.filter((c) => picked.includes(c.slug)).map((c) => c.name);
  const barTitle = pickedNames.length ? pickedNames.join(" & ") : category.name;
  const scopeCategory = picked.length ? picked.join(",") : slug;
  const listingParams = parseListingParams(sp, { category: scopeCategory });
  // A brand-new category with nothing listed yet and no filters applied reads as "coming soon", not "no products found".
  const fresh = !LISTING_FILTER_KEYS.some((k) => sp[k] != null && sp[k] !== "");
  const [result, brands, lines] = await Promise.all([searchProducts(listingParams), getBrands(), getCategoryTabs()]);
  const seo = CATEGORY_SEO[slug];
  const crumbs = [{ name: "Home", url: `${site.url}/` }, ...(parent ? [{ name: parent.name, url: `${site.url}/c/${parent.slug}` }] : []), { name: category.name, url: `${site.url}/c/${slug}` }];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": `${site.url}/c/${slug}#page`, name: seo?.h1 ?? category.name, url: `${site.url}/c/${slug}`, isPartOf: { "@id": `${site.url}/#website` } },
      { "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })) },
    ],
  };

  return (
    <div className="flex flex-col px-4 pt-1 sm:px-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* The bar's title is the page title on phones; the band under it switches between the shop's lines. */}
      <ShopPageHeader title={seo?.h1 ?? category.name} barTitle={barTitle} keepTitle={Boolean(seo)} barClassName="-mt-1 mb-0" fallback={parent ? `/c/${parent.slug}` : "/categories"} cart actions={<SearchLink scope={{ slug: scopeCategory, name: barTitle }} />} subtitle={seo ? undefined : category.description ?? `${result.total} products at Merta Deal`}
        className="order-3 px-0 max-lg:pb-1 max-lg:pt-3 max-lg:[&_h1]:text-lg" />
      <CategoryBand lines={lines} active={parent?.slug ?? slug} className="order-1 -mx-4 sm:mx-0 lg:mt-3" />
      <nav aria-label="Breadcrumb" className="order-2 mt-3 text-xs text-ink-3 max-lg:hidden"><Link href="/" className="tap hover:text-brand-700">Home</Link> / {parent ? <><Link href={`/c/${parent.slug}`} className="tap hover:text-brand-700">{parent.name}</Link> / </> : null}<span className="text-ink">{category.name}</span></nav>
      {/* The introduction opens the page on a desktop; on a phone the products come first and it closes the page. */}
      {seo ? (
        <div className="order-6 mb-2 mt-6 max-w-3xl border-t border-line pt-4 text-sm leading-relaxed text-ink-2 lg:order-4 lg:-mt-1 lg:mb-4 lg:border-0 lg:pt-0">
          <p>{seo.intro}</p>
          <p lang="hi" className="mt-1 text-ink-3">{seo.hindi}</p>
        </div>
      ) : null}
      <div className="order-5 min-w-0">
        {children.length ? (
          <div className="scroll-x -mx-4 mb-3 scroll-pl-4 px-4 sm:mx-0 sm:scroll-pl-0 sm:px-0">
            {children.map((c) => <Link key={c.id} href={`/c/${c.slug}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line-2 bg-card px-3.5 text-sm font-medium text-ink-2 hover:border-brand-500 hover:text-brand-700">{c.name}</Link>)}
          </div>
        ) : null}
        <ProductListing result={result} filters={{ brands, categories: children.map((c) => ({ name: c.name, slug: c.slug })) }} scope={{ category: scopeCategory }} hideCategoryChips
          emptyTitle={fresh ? `${category.name} coming soon` : `No ${barTitle.toLowerCase()} products right now`} emptyHint={fresh ? "We're still stocking this shelf. The other lines above are ready to order now." : "Check back soon, or remove a filter if you added one."} />
      </div>
    </div>
  );
}

/** A category the shop has paused: say so plainly and point at what is on sale, rather than a dead end. */
function HiddenCategory({ name, lines }: { name: string; lines: CategoryTab[] }) {
  return (
    <div className="px-4 pt-1 sm:px-0">
      <ShopPageHeader title={name} fallback="/categories" cart />
      <section className="mt-2 rounded-lg border border-line bg-card p-5 text-center shadow-card">
        <p className="font-display text-lg font-bold text-ink">{name} are not available right now</p>
        <p className="mt-1 text-sm text-ink-2">We have paused {name.toLowerCase()} for the moment and will bring them back soon. Grocery and kirana essentials are delivered as usual.</p>
        <p lang="hi" className="mt-1 text-sm text-ink-3">{name === "Fruits" ? "फल" : name === "Vegetables" ? "सब्ज़ी" : name} फ़िलहाल उपलब्ध नहीं हैं। किराना सामान की डिलीवरी जारी है।</p>
        <div className="mt-4 flex justify-center">
          <Link href="/categories" className="tap inline-flex min-h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">All categories</Link>
        </div>
      </section>
      {/* What is on sale now: the shop's live lines, from the catalogue. */}
      <CategoryBand lines={lines.filter((l) => l.count > 0)} label="Shop these instead" className="-mx-4 mt-5 sm:mx-0" />
    </div>
  );
}
