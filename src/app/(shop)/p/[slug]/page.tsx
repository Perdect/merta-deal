import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Star, Mail, Phone } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getProductDetail, getWishlistIds, searchProducts, getPublicSettings } from "@/lib/data/catalog";
import { ProductHero, ShareButton } from "@/components/shop/product-hero";
import { AppBar } from "@/components/shop/app-bar";
import { ProductPurchase, EtaBadge } from "@/components/shop/product-purchase";
import { ProductBuyBar } from "@/components/shop/product-buy-bar";
import { DetailSection, type DetailRow } from "@/components/shop/product-details";
import { ProductRail } from "@/components/shop/product-card";
import { WishlistButton } from "@/components/shop/wishlist-button";
import { VegMark } from "@/components/ui/badge";
import { StarRating } from "@/components/ui/misc";
import { SectionHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { site } from "@/config/site";
import { TrackEvent } from "@/components/shared/track-event";

type Props = { params: Promise<{ slug: string }> };

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; const p = await getProductDetail(slug);
  if (!p) notFound(); // during metadata, so crawlers get a real 404 status, not a soft 404
  const pack = p.pack_label ? ` ${p.pack_label}` : "";
  const price = p.selling_price ?? null;
  const title = `${p.name}${pack} – Price in ${site.city}`;
  const stock = !p.inventory_id ? "Currently unavailable" : p.stock_status === "out_of_stock" ? "Out of stock right now" : `₹${price} at ${site.seoName}`;
  const brandPrefix = p.brand_name && !p.name.toLowerCase().startsWith(p.brand_name.toLowerCase()) ? `${p.brand_name} ` : "";
  const description = `${brandPrefix}${p.name}${pack}. ${stock}${p.mrp && price != null && p.mrp > price ? ` (MRP ₹${p.mrp})` : ""}. Home delivery across ${site.city}, Rajasthan — usually ${site.deliveryWindowShort}. Pay by UPI or cash on delivery.`;
  const image = p.image_url ? (p.image_url.startsWith("http") ? p.image_url : `${site.url}${p.image_url}`) : undefined;
  return { title, description, alternates: { canonical: `/p/${slug}` }, openGraph: { type: "website", title, description, url: `/p/${slug}`, images: image ? [{ url: image, alt: `${p.name}${pack}` }] : undefined } };
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
  const [user, product, wished, settings] = await Promise.all([getSessionUser(), getProductDetail(slug), getWishlistIds(), getPublicSettings()]);
  if (!product) notFound();
  // "More from <brand>" is a live catalog query, not a stored list.
  const moreFromBrand = product.brand_slug
    ? (await searchProducts({ brands: [product.brand_slug], inStock: true, pageSize: 12 })).items.filter((p) => p.id !== product.id)
    : [];
  const images = [product.image_url, ...(product.images ?? [])].filter(Boolean) as string[];
  const price = product.selling_price ?? product.base_mrp;
  const mrp = product.mrp ?? product.base_mrp;
  const brandHref = product.brand_slug ? `/search?brand=${product.brand_slug}` : null;
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
    { label: "Weight", value: `${product.weight_value} ${product.weight_unit}` },
    product.shelf_life ? { label: "Shelf Life", value: product.shelf_life } : null,
    product.ingredients ? { label: "Ingredients", value: product.ingredients } : null,
    nutrition.length ? { label: "Nutrition", value: nutrition.join(", ") } : null,
    product.country_of_origin ? { label: "Country of Origin", value: product.country_of_origin } : null,
  ] as (DetailRow | null)[]).filter((r): r is DetailRow => r !== null);
  const seller = ([
    product.seller_name ? { label: "Seller Name", value: product.seller_name } : null,
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
          <ProductHero images={images} name={product.name} brand={product.brand_name} packSize={product.pack_label} price={price} mrp={mrp} backHref={`/c/${product.category_slug}`}>
            {user ? <WishlistButton productId={product.id} initial={wished.has(product.id) || product.in_wishlist} size={20} className="h-10 w-10 shadow-card" /> : null}
          </ProductHero>
          {/* Floats above the dock on mobile; a wide button under the gallery on desktop. */}
          <div className="md:mt-4"><ProductBuyBar product={product} signedIn={Boolean(user)} /></div>
        </div>

        <div className="relative -mt-6 rounded-t-[28px] bg-card px-4 pb-5 pt-5 shadow-[0_-10px_24px_-18px_rgb(0_0_0/0.35)] md:mt-0 md:rounded-2xl md:border md:border-line md:p-6 md:shadow-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <VegMark veg={product.is_veg} />
                {product.rating_count ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-fresh-50 px-2 py-1 text-sm font-bold text-brand-800">
                    <Star className="h-3.5 w-3.5 fill-fresh text-fresh" />{Number(product.rating_avg).toFixed(1)}
                    <span className="font-medium text-ink-3">({compact.format(product.rating_count)})</span>
                  </span>
                ) : null}
                {product.is_local ? <span className="rounded-md bg-saffron-100 px-2 py-1 text-xs font-bold text-saffron-700">MERTA LOCAL</span> : null}
              </div>
              <h1 className="mt-2 font-display text-[22px] font-bold leading-tight text-ink md:text-2xl">{product.name}</h1>
              <p className="mt-1.5 text-[15px] text-ink-3">Net Qty: {product.pack_label ?? `${product.weight_value} ${product.weight_unit}`}</p>
            </div>
            <ShareButton name={product.name} price={price} className="hidden shrink-0 md:flex" />
          </div>
          <EtaBadge className="mt-3" />
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
          {/* The store's own description comes first: it is what an admin edits most. */}
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

      {moreFromBrand.length ? <section className="mt-8"><SectionHeader title={`More from ${product.brand_name}`} href={brandHref ?? undefined} /><ProductRail products={moreFromBrand} signedIn={Boolean(user)} wished={wished} /></section> : null}
      {product.frequently_bought.length ? <section className="mt-8"><SectionHeader title="Frequently bought together" /><ProductRail products={product.frequently_bought} signedIn={Boolean(user)} wished={wished} /></section> : null}
      {product.related.length ? <section className="mt-8"><SectionHeader title="Similar products" href={`/c/${product.category_slug}`} /><ProductRail products={product.related} signedIn={Boolean(user)} wished={wished} /></section> : null}
    </div>
  );
}
