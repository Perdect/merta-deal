import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, MapPin, Mic, Sparkles } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getCategories, getNearbyStores, getWishlistIds, searchProducts } from "@/lib/data/catalog";
import { ProductGrid } from "@/components/shop/product-card";
import { StoreCard } from "@/components/shop/store-card";
import { SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { seoPages, site } from "@/config/site";
import { AREAS, PINCODES, seoCopy, type SeoSlug } from "../seo-content";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() { return seoPages.map((p) => ({ slug: p.slug })); }

function findPage(slug: string) { return seoPages.find((p) => p.slug === slug) ?? null; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = findPage(slug);
  if (!page) return {};
  const copy = seoCopy[page.slug as SeoSlug];
  return {
    title: page.title,
    description: copy.description,
    keywords: copy.keywords,
    alternates: { canonical: `/${page.slug}` },
    openGraph: { type: "website", title: `${page.title} | ${site.name}`, description: copy.description, url: `/${page.slug}`, siteName: site.name, locale: "en_IN" },
    twitter: { card: "summary_large_image", title: page.title, description: copy.description },
  };
}

export default async function SeoLandingPage({ params }: Props) {
  const { slug } = await params;
  const page = findPage(slug);
  if (!page) notFound();
  const copy = seoCopy[page.slug as SeoSlug];
  const isKirana = page.slug === "kirana-store-merta";

  const [user, result, wished, categories, stores] = await Promise.all([
    getSessionUser(),
    searchProducts({ category: page.categorySlug ?? undefined, pageSize: 12, sort: "popular" }),
    getWishlistIds(),
    getCategories(),
    isKirana ? getNearbyStores(site.center.lat, site.center.lng, 25, 12) : Promise.resolve([]),
  ]);
  const products = result.items.slice(0, 12);
  const topCategories = categories.filter((c) => !c.parent_id);
  const related = copy.relatedCategories.map((s) => topCategories.find((c) => c.slug === s) ?? categories.find((c) => c.slug === s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const otherPages = seoPages.filter((p) => p.slug !== page.slug);
  const url = `${site.url}/${page.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${url}#webpage`, url, name: page.title, description: copy.description, inLanguage: "en-IN", isPartOf: { "@type": "WebSite", "@id": `${site.url}#website`, name: site.name, url: site.url }, breadcrumb: { "@id": `${url}#breadcrumb` }, about: { "@id": `${site.url}#business` } },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: site.url }, { "@type": "ListItem", position: 2, name: page.title, item: url }] },
      { "@type": "GroceryStore", "@id": `${site.url}#business`, name: site.name, url: site.url, slogan: site.tagline, description: site.description, telephone: site.supportPhone, email: site.supportEmail, priceRange: "₹", currenciesAccepted: "INR", paymentAccepted: "Cash, UPI, Credit Card, Debit Card",
        address: { "@type": "PostalAddress", addressLocality: site.city, addressRegion: site.state, postalCode: site.defaultPincode, addressCountry: "IN" },
        geo: { "@type": "GeoCoordinates", latitude: site.center.lat, longitude: site.center.lng },
        areaServed: AREAS.map((a) => ({ "@type": "Place", name: `${a}, ${site.city}` })) },
      { "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: copy.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
      ...(products.length ? [{ "@type": "ItemList", "@id": `${url}#products`, name: `${page.h1} — popular products`, itemListElement: products.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${site.url}/p/${p.slug}`, name: p.name })) }] : []),
    ],
  };

  return (
    <div className="px-4 pt-1 sm:px-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="mt-2 text-xs text-ink-3"><Link href="/" className="hover:text-brand-700">Home</Link> / <span className="text-ink">{page.title}</span></nav>

      <header className="mt-3 rounded-xl border border-line bg-gradient-to-br from-brand-50 to-card p-5 shadow-card sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">{site.city}, {site.state} · {PINCODES.join(" / ")}</p>
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">{page.h1}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2 sm:text-base">{page.intro}</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {copy.highlights.map((h) => <li key={h} className="flex items-start gap-2 text-sm text-ink-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{h}</li>)}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={page.categorySlug ? `/c/${page.categorySlug}` : "/stores"} className="inline-flex h-11 items-center gap-2 rounded-sm bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">{page.categorySlug ? "Shop the full category" : "Browse all stores"}<ArrowRight className="h-4 w-4" /></Link>
          <Link href="/assistant" className="inline-flex h-11 items-center gap-2 rounded-sm border border-line-2 bg-card px-5 text-sm font-semibold text-ink hover:bg-surface-2"><Sparkles className="h-4 w-4 text-brand-600" />Make a list with AI</Link>
          <Link href="/assistant?mode=voice" className="inline-flex h-11 items-center gap-2 rounded-sm border border-line-2 bg-card px-4 text-sm font-semibold text-ink hover:bg-surface-2"><Mic className="h-4 w-4 text-brand-600" />Bol kar order karo</Link>
        </div>
      </header>

      <section className="mt-8">
        <SectionHeader title={page.categorySlug ? "Popular right now" : "Popular across Merta"} subtitle={`${result.total} products in stock from Merta kirana stores`} href={page.categorySlug ? `/c/${page.categorySlug}` : "/search?sort=popular"} className="px-0" />
        {products.length ? <ProductGrid products={products} signedIn={Boolean(user)} wished={wished} /> : <EmptyState title="Stores are stocking up" description="Products for this page will appear as soon as a Merta store lists them." compact />}
      </section>

      {isKirana ? (
        <section className="mt-8">
          <SectionHeader title="Kirana stores near the centre of Merta" subtitle="Sorted by distance from Gandhi Chowk" href="/stores" className="px-0" />
          {stores.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{stores.map((s) => <StoreCard key={s.id} store={s} />)}</div> : <EmptyState title="No stores yet" description="We are onboarding kirana stores across Merta City." compact />}
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4 text-sm leading-relaxed text-ink-2 sm:text-[15px]">
          {copy.body.map((p) => <p key={p}>{p}</p>)}
          <div className="rounded-lg border border-line bg-card p-4 shadow-card">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><MapPin className="h-4 w-4 text-brand-600" />Areas we deliver to</p>
            <p className="mt-1.5 text-sm text-ink-2">{AREAS.join(" · ")} — pincodes {PINCODES.join(" and ")}. Nagaur, Jodhpur, Ajmer, Pali and Jaipur are coming soon.</p>
          </div>
        </div>
        <aside className="space-y-4">
          <div className="rounded-lg border border-line bg-card p-4 shadow-card">
            <p className="text-sm font-semibold text-ink">Shop by category</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {related.map((c) => <li key={c.id}><Link href={`/c/${c.slug}`} className="inline-flex rounded-full border border-line-2 bg-card px-3 py-1.5 text-xs font-medium text-ink-2 hover:border-brand-500 hover:text-brand-700">{c.name}</Link></li>)}
              <li><Link href="/categories" className="inline-flex rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">All categories</Link></li>
            </ul>
          </div>
          <div className="rounded-lg border border-line bg-card p-4 shadow-card">
            <p className="text-sm font-semibold text-ink">More from Merta Deal</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {otherPages.map((p) => <li key={p.slug}><Link href={`/${p.slug}`} className="text-brand-700 hover:underline">{p.title}</Link></li>)}
              <li><Link href="/stores" className="text-brand-700 hover:underline">All kirana stores in Merta City</Link></li>
              <li><Link href="/track" className="text-brand-700 hover:underline">Track an order</Link></li>
            </ul>
          </div>
        </aside>
      </section>

      <section className="mt-8 pb-6" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="font-display text-lg font-bold text-ink">Frequently asked questions</h2>
        <dl className="mt-3 divide-y divide-line rounded-lg border border-line bg-card shadow-card">
          {copy.faqs.map((f) => (
            <div key={f.q} className="p-4">
              <dt className="text-sm font-semibold text-ink">{f.q}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-ink-2">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
