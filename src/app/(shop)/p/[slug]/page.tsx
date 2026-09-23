import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getProductDetail, getWishlistIds } from "@/lib/data/catalog";
import { ProductGallery } from "@/components/shop/product-gallery";
import { ProductPurchase } from "@/components/shop/product-purchase";
import { ProductRail } from "@/components/shop/product-card";
import { WishlistButton } from "@/components/shop/wishlist-button";
import { VegMark } from "@/components/ui/badge";
import { StarRating } from "@/components/ui/misc";
import { SectionHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { site } from "@/config/site";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; const p = await getProductDetail(slug);
  if (!p) return {};
  const title = `${p.name} ${p.pack_label ?? ""} — buy online in ${site.city}`.trim();
  const description = `${p.name}${p.brand_name ? ` by ${p.brand_name}` : ""} at ₹${p.selling_price ?? p.base_mrp}${p.mrp && p.selling_price && p.mrp > p.selling_price ? ` (MRP ₹${p.mrp})` : ""}. Delivered from local kirana stores in ${site.city} in 30–60 minutes.`;
  return { title, description, alternates: { canonical: `/p/${slug}` }, openGraph: { title, description, url: `/p/${slug}`, images: p.image_url ? [{ url: p.image_url }] : undefined } };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [user, product, wished] = await Promise.all([getSessionUser(), getProductDetail(slug), getWishlistIds()]);
  if (!product) notFound();
  const images = [product.image_url, ...(product.images ?? [])].filter(Boolean) as string[];
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: product.name, image: images, description: product.description ?? undefined, sku: product.id,
    brand: product.brand_name ? { "@type": "Brand", name: product.brand_name } : undefined,
    offers: product.offers.map((o) => ({ "@type": "Offer", price: o.selling_price, priceCurrency: "INR", availability: o.status === "out_of_stock" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", seller: { "@type": "GroceryStore", name: o.store_name }, url: `${site.url}/p/${slug}` })),
    aggregateRating: product.rating_count ? { "@type": "AggregateRating", ratingValue: product.rating_avg, reviewCount: product.rating_count } : undefined,
  };
  const nutrition = product.nutrition && typeof product.nutrition === "object" ? Object.entries(product.nutrition) : [];

  return (
    <div className="pt-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="px-4 pt-2 text-xs text-ink-3 sm:px-0"><Link href="/categories" className="hover:text-brand-700">Categories</Link> / <Link href={`/c/${product.category_slug}`} className="hover:text-brand-700">{product.category_name}</Link></nav>
      <div className="mt-3 grid gap-6 px-4 sm:px-0 md:grid-cols-2 lg:gap-10">
        <div className="relative">
          <ProductGallery images={images} name={product.name} brand={product.brand_name} packSize={product.pack_label} />
          {user ? <div className="absolute right-3 top-3"><WishlistButton productId={product.id} initial={wished.has(product.id) || product.in_wishlist} size={20} className="h-10 w-10" /></div> : null}
        </div>
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3"><VegMark veg={product.is_veg} />{product.brand_name ? <Link href={`/search?brand=${product.brand_slug}`} className="font-semibold text-brand-700">{product.brand_name}</Link> : null}{product.is_local ? <span className="rounded-xs bg-saffron-100 px-1.5 py-0.5 font-bold text-saffron-700">MERTA LOCAL</span> : null}</div>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-ink">{product.name}</h1>
          <p className="mt-1 text-sm text-ink-3">{product.pack_label} · {product.category_name}</p>
          {product.rating_count ? <StarRating value={product.rating_avg} count={product.rating_count} className="mt-2" /> : null}
          <div className="mt-5"><ProductPurchase product={product} signedIn={Boolean(user)} /></div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 px-4 sm:px-0 md:grid-cols-2">
        <section className="rounded-lg border border-line bg-card p-4">
          <h2 className="text-base font-bold text-ink">About this product</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{product.description ?? "No description provided by the store yet."}</p>
          <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            {product.ingredients ? <><dt className="text-ink-3">Ingredients</dt><dd className="text-ink">{product.ingredients}</dd></> : null}
            {product.manufacturer ? <><dt className="text-ink-3">Manufacturer</dt><dd className="text-ink">{product.manufacturer}</dd></> : null}
            {product.country_of_origin ? <><dt className="text-ink-3">Origin</dt><dd className="text-ink">{product.country_of_origin}</dd></> : null}
            <dt className="text-ink-3">Net quantity</dt><dd className="text-ink">{product.weight_value} {product.weight_unit}</dd>
            <dt className="text-ink-3">MRP</dt><dd className="text-ink">₹{product.base_mrp} (incl. of all taxes)</dd>
          </dl>
        </section>
        <section className="rounded-lg border border-line bg-card p-4">
          <h2 className="text-base font-bold text-ink">Nutrition</h2>
          {nutrition.length ? (
            <table className="mt-2 w-full text-sm"><tbody>{nutrition.map(([k, v]) => <tr key={k} className="border-b border-line last:border-0"><td className="py-1.5 capitalize text-ink-3">{k.replace(/_/g, " ")}</td><td className="py-1.5 text-right font-medium text-ink tabular">{String(v)}</td></tr>)}</tbody></table>
          ) : <p className="mt-2 text-sm text-ink-3">Nutrition details not listed for this product.</p>}
          <h2 className="mt-5 text-base font-bold text-ink">Reviews {product.rating_count ? `(${product.rating_count})` : ""}</h2>
          {product.reviews.length ? (
            <ul className="mt-2 space-y-3">{product.reviews.slice(0, 5).map((r) => <li key={r.id} className="border-b border-line pb-3 last:border-0"><div className="flex items-center justify-between"><StarRating value={r.rating} showValue={false} /><span className="text-xs text-ink-3">{formatDate(r.created_at)}</span></div>{r.title ? <p className="mt-1 text-sm font-semibold text-ink">{r.title}</p> : null}<p className="text-sm text-ink-2">{r.comment}</p><p className="mt-1 text-xs text-ink-3">— {r.user_name}</p></li>)}</ul>
          ) : <p className="mt-2 text-sm text-ink-3">No reviews yet. Order it and be the first to review.</p>}
        </section>
      </div>

      {product.frequently_bought.length ? <section className="mt-8"><SectionHeader title="Frequently bought together" /><ProductRail products={product.frequently_bought} signedIn={Boolean(user)} wished={wished} /></section> : null}
      {product.related.length ? <section className="mt-8"><SectionHeader title="Similar products" href={`/c/${product.category_slug}`} /><ProductRail products={product.related} signedIn={Boolean(user)} wished={wished} /></section> : null}
    </div>
  );
}
