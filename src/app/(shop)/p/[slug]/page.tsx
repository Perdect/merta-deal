import type { Metadata } from "next";

/** Static per product (rendered on first visit, then cached), refreshed every minute and on catalogue changes; nothing personal is rendered here. */
export const revalidate = 60;
export const dynamicParams = true;
export function generateStaticParams() { return []; }
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Star, Mail, Phone } from "lucide-react";
import { getProductDetail, getPublicSettings } from "@/lib/data/catalog";
import { paymentPhrase } from "@/lib/seo-copy";
import { ProductHero, ShareButton } from "@/components/shop/product-hero";
import { AppBar } from "@/components/shop/app-bar";
import { ProductPurchase, EtaBadge } from "@/components/shop/product-purchase";
import { ProductBuyBar } from "@/components/shop/product-buy-bar";
import { PackChips } from "@/components/shop/pack-chips";
import { CakeOptions } from "@/components/shop/cake-options";
import { isMadeToOrder } from "@/lib/cake";
import { DetailSection, type DetailRow } from "@/components/shop/product-details";
import { ProductRail } from "@/components/shop/product-card";
import { Badge, DiscountBadge, VegMark } from "@/components/ui/badge";
import { resolveOffer } from "@/components/shop/product-offer";
import { StarRating } from "@/components/ui/misc";
import { SectionHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { site } from "@/config/site";
import { TrackEvent } from "@/components/shared/track-event";

type Props = { params: Promise<{ slug: string }> };

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [p, settings] = await Promise.all([getProductDetail(slug), getPublicSettings()]);
  if (!p) notFound(); // during metadata, so crawlers get a real 404 status, not a soft 404
  const pack = p.pack_label ? ` ${p.pack_label}` : "";
  const price = p.selling_price ?? null;
  const title = `${p.name}${pack} – Price in ${site.city}`;
  const stock = !p.inventory_id ? "Currently unavailable" : p.stock_status === "out_of_stock" ? "Out of stock right now" : `₹${price} at ${site.seoName}`;
  const brandPrefix = p.brand_name && !p.name.toLowerCase().startsWith(p.brand_name.toLowerCase()) ? `${p.brand_name} ` : "";
  const pay = paymentPhrase(settings);
  const description = `${brandPrefix}${p.name}${pack}. ${stock}${p.mrp && price != null && p.mrp > price ? ` (MRP ₹${p.mrp})` : ""}. Home delivery across ${site.city}, Rajasthan — usually ${site.deliveryWindowShort}.${pay ? ` ${pay}` : ""}`;
  const image = p.image_url ? (p.image_url.startsWith("http") ? p.image_url : `${site.url}${p.image_url}`) : undefined;
  return { title, description, alternates: { canonical: `/p/${slug}` }, openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", title, description, url: `/p/${slug}`, images: image ? [{ url: image, alt: `${p.name}${pack}` }] : undefined } };
}

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-4 md:p-6 ${className ?? ""}`}>
      {title ? <h2 className="font-display text-lg font-bold text-ink">{title}</h2> : null}
      {children}
    </section>
  );
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [product, settings] = await Promise.all([getProductDetail(slug), getPublicSettings()]);
  if (!product) notFound();
  // "More from <brand>" comes with the product (same round trip), filtered live by the database.
  const moreFromBrand = product.more_from_brand ?? [];
  const images = [product.image_url, ...(product.images ?? [])].filter(Boolean) as string[];
  const price = product.selling_price ?? product.base_mrp;
  const mrp = product.mrp ?? product.base_mrp;
  const brandHref = product.brand_slug ? `/search?brand=${product.brand_slug}` : null;
  // The same listing the price block and the buy bar read, so the photo's badge can never disagree with them.
  const offer = resolveOffer(product);
  const soldOut = !offer || offer.status === "out_of_stock";
  const offPct = offer && !soldOut && offer.mrp > offer.selling_price ? Math.round(Number(offer.discount_pct ?? 0)) : 0;
  // Only the pack size the catalogue states. A product without one shows no size at all: the weight
  // columns behind it are defaults on those rows, not a measured pack.
  const packSize = product.pack_label?.trim() || null;
  const seeAll = "tap inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600";
  const supportEmail = str(settings.support_email, site.supportEmail);
  const supportPhone = str(settings.support_phone, site.supportPhone);
  const telHref = `tel:+${supportPhone.replace(/\D/g, "").replace(/^0+/, "").replace(/^(?!91)/, "91")}`;
  const abs = (u: string) => (u.startsWith("http") ? u : `${site.url}${u}`);
  const pageUrl = `${site.url}/p/${slug}`;
  // Structured data mirrors exactly what the page shows: the same price, currency and stock state.
  // `seller` is omitted: produce pages list a supplier under "Seller Information", so naming anyone
  // else in markup would contradict the visible page.
  const productLd = (product.inventory_id && product.selling_price != null) || product.rating_count ? {
    "@type": "Product", "@id": `${pageUrl}#product`, name: `${product.name}${product.pack_label ? ` ${product.pack_label}` : ""}`, url: pageUrl,
    image: images.map(abs), description: product.description ?? undefined, sku: product.slug,
    brand: product.brand_name ? { "@type": "Brand", name: product.brand_name } : undefined,
    category: product.category_name,
    offers: product.inventory_id && product.selling_price != null ? {
      "@type": "Offer", url: pageUrl, price: Number(product.selling_price).toFixed(2), priceCurrency: "INR", itemCondition: "https://schema.org/NewCondition",
      availability: product.stock_status === "out_of_stock" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      areaServed: { "@type": "City", name: `${site.city}, ${site.state}` },
    } : undefined,
    // Ratings only from approved customer reviews shown on this page.
    aggregateRating: product.rating_count ? { "@type": "AggregateRating", ratingValue: Number(product.rating_avg).toFixed(1), reviewCount: product.rating_count } : undefined,
  } : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      ...(productLd ? [productLd] : []),
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${site.url}/` },
        { "@type": "ListItem", position: 2, name: product.category_name, item: `${site.url}/c/${product.category_slug}` },
        { "@type": "ListItem", position: 3, name: product.name, item: pageUrl },
      ] },
    ],
  };
  const nutrition = product.nutrition && typeof product.nutrition === "object" ? Object.entries(product.nutrition).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`) : [];
  const highlights = ([
    product.brand_name ? { label: "Brand", value: product.brand_name } : null,
    { label: "Product Type", value: product.category_name },
    packSize ? { label: "Pack size", value: packSize } : null,
    product.shelf_life ? { label: "Shelf Life", value: product.shelf_life } : null,
    product.ingredients ? { label: "Ingredients", value: product.ingredients } : null,
    nutrition.length ? { label: "Nutrition", value: nutrition.join(", ") } : null,
  ] as (DetailRow | null)[]).filter((r): r is DetailRow => r !== null);
  const seller = ([
    // MertaDeal is the seller of record unless a product names another seller.
    { label: "Seller Name", value: product.seller_name || site.seoName },
    product.seller_address ? { label: "Seller Address", value: product.seller_address } : null,
    product.seller_license ? { label: "Seller License No.", value: product.seller_license } : null,
  ] as (DetailRow | null)[]).filter((r): r is DetailRow => r !== null);
  const crumbs = [{ href: "/", label: "Home" }, { href: `/c/${product.category_slug}`, label: product.category_name }];

  return (
    <div className="pb-24 md:pb-0 md:pt-2">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <TrackEvent name="view_item" params={{ value: price ?? undefined, items: [{ item_id: product.slug, item_name: product.name, price: price ?? undefined, item_category: product.category_name }] }} />
      <AppBar title={product.name} back={`/c/${product.category_slug}`} cart className="mb-0 md:-mt-2" actions={<ShareButton name={product.name} price={price ?? undefined} className="tap h-10 w-10 border-0 bg-transparent" />} />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 px-4 pb-2 pt-3 text-xs text-ink-3 max-lg:hidden sm:px-0 md:pb-4 md:text-sm">
        {crumbs.map((c) => <span key={c.href} className="inline-flex items-center gap-1"><Link href={c.href} className="tap hover:text-brand-700">{c.label}</Link><ChevronRight className="h-3.5 w-3.5 text-ink-4" /></span>)}
        <span className="font-semibold text-ink">{product.name}</span>
      </nav>

      <div className="md:grid md:grid-cols-[1.05fr_1fr] md:items-start md:gap-8">
        <div>
          <ProductHero images={images} name={product.name} brand={product.brand_name} packSize={product.pack_label} price={price} mrp={mrp} backHref={`/c/${product.category_slug}`} dimmed={soldOut}
            badge={soldOut ? <Badge tone="dark" size="md" className="rounded-lg">Out of stock</Badge> : offPct > 0 ? <DiscountBadge pct={offPct} className="rounded-lg px-2.5 py-1.5 text-[13px] shadow-card" /> : null} />
          {/* Floats above the dock on mobile; a wide button under the gallery on desktop. */}
          <div className="md:mt-4"><ProductBuyBar product={product} /></div>
        </div>

        <div className="relative -mt-6 rounded-t-[28px] bg-card px-4 pb-5 pt-5 shadow-[0_-10px_24px_-18px_rgb(0_0_0/0.35)] md:mt-0 md:rounded-2xl md:border md:border-line md:p-6 md:shadow-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <VegMark veg={product.is_veg} />
                {/* The way back to the shelf on phones and tablets, where the breadcrumb is not shown. */}
                <Link href={`/c/${product.category_slug}`} className="tap inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600 lg:hidden">{product.category_name}<ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /></Link>
                {product.rating_count ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-fresh-50 px-2 py-1 text-sm font-bold text-brand-800">
                    <Star className="h-3.5 w-3.5 fill-fresh text-fresh" />{Number(product.rating_avg).toFixed(1)}
                    <span className="font-medium text-ink-3">({compact.format(product.rating_count)})</span>
                  </span>
                ) : null}
                {product.is_local ? <span className="rounded-md bg-saffron-100 px-2 py-1 text-xs font-bold text-saffron-700">MERTA LOCAL</span> : null}
              </div>
              <h1 className="mt-2 font-display text-[22px] font-bold leading-tight text-ink md:text-2xl">{product.name}</h1>
              {packSize ? <p className="mt-1.5 text-[15px] text-ink-3">Net Qty: <span className="font-semibold text-ink-2">{packSize}</span></p> : null}
            </div>
            <ShareButton name={product.name} price={price} className="hidden shrink-0 md:flex" />
          </div>
          <EtaBadge className="mt-3" />
          <PackChips current={product.id} options={product.variants ?? []} className="mt-4" />
          {isMadeToOrder(product) ? <CakeOptions product={product} note={str(settings.cake_variance_note, "") || null} slots={Array.isArray(settings.scheduled_slots) && settings.scheduled_slots.length > 0} /> : null}
          <div className="mt-4">
            <ProductPurchase product={product}>
              {brandHref && product.brand_name ? (
                <Link href={brandHref} className="flex items-center gap-3 rounded-xl border border-line px-3 py-3 transition-colors hover:bg-surface">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-sm font-bold uppercase text-brand-700">{product.brand_name.slice(0, 2)}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">View all {product.brand_name} products</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
                </Link>
              ) : null}
            </ProductPurchase>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4 px-4 sm:px-0 md:mt-6 md:grid md:grid-cols-[1.05fr_1fr] md:items-start md:gap-x-8 md:gap-y-4 md:space-y-0">
        <div className="space-y-4 md:col-start-2">
          {/* The product description comes first: it is what an admin edits most. */}
          {product.description ? <Card title="About this product"><p className="mt-3 text-[15px] leading-relaxed text-ink-2">{product.description}</p></Card> : null}
          <DetailSection title="Highlights" rows={highlights} initial={6} />
          {seller.length ? <DetailSection title="Seller Information" rows={seller} initial={3} /> : null}
          <Card title="Customer Care">
            <p className="mt-2 text-[15px] text-ink-2">In case of any issue, contact us</p>
            <dl className="mt-3 grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-[15px] sm:grid-cols-[168px_minmax(0,1fr)] sm:gap-x-4">
              <dt className="text-ink-3">Email</dt><dd className="min-w-0"><a href={`mailto:${supportEmail}`} className="inline-flex max-w-full items-center gap-1.5 font-semibold text-brand-700 hover:underline"><Mail className="h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{supportEmail}</span></a></dd>
              <dt className="text-ink-3">Phone</dt><dd className="min-w-0"><a href={telHref} className="inline-flex max-w-full items-center gap-1.5 font-semibold text-brand-700 hover:underline"><Phone className="h-4 w-4 shrink-0" aria-hidden /><span className="tabular">{supportPhone}</span></a></dd>
            </dl>
          </Card>
        </div>
        <div className="space-y-4 md:col-start-1 md:row-start-1">
          <Card title={`Reviews ${product.rating_count ? `(${product.rating_count})` : ""}`}>
            {product.reviews.length ? (
              <ul className="mt-3 space-y-3">{product.reviews.slice(0, 5).map((r) => <li key={r.id} className="border-b border-line pb-3 last:border-0"><div className="flex items-center justify-between"><StarRating value={r.rating} showValue={false} /><span className="text-xs text-ink-3">{formatDate(r.created_at)}</span></div>{r.title ? <p className="mt-1 text-sm font-semibold text-ink">{r.title}</p> : null}<p className="text-sm text-ink-2">{r.comment}</p><p className="mt-1 text-xs text-ink-3">— {r.user_name}</p></li>)}</ul>
            ) : <p className="mt-3 text-sm text-ink-3">No reviews yet. Order it and be the first to review.</p>}
          </Card>
        </div>
      </div>

      {/* "See all" is a router link (the default header link reloads the whole page). */}
      {moreFromBrand.length ? <section className="mt-8"><SectionHeader title={`More from ${product.brand_name}`} action={brandHref ? <Link href={brandHref} className={seeAll}>See all<ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden /></Link> : undefined} /><ProductRail products={moreFromBrand} /></section> : null}
      {product.frequently_bought.length ? <section className="mt-8"><SectionHeader title="Frequently bought together" /><ProductRail products={product.frequently_bought} /></section> : null}
      {product.related.length ? <section className="mt-8"><SectionHeader title="Similar products" action={<Link href={`/c/${product.category_slug}`} className={seeAll}>See all<ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden /></Link>} /><ProductRail products={product.related} /></section> : null}
    </div>
  );
}
