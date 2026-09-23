import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, MapPin, Phone, Store as StoreIcon } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getBrands, getStoreBySlug, getStoreReviews, getWishlistIds, searchProducts, getCategories } from "@/lib/data/catalog";
import { parseListingParams } from "@/lib/listing-params";
import { ProductListing } from "@/components/shop/product-listing";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { site } from "@/config/site";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; const store = await getStoreBySlug(slug);
  if (!store) return {};
  return { title: `${store.name} — ${store.area}, ${site.city}`, description: store.description ?? `Order online from ${store.name} in ${store.area}, ${site.city}.`, alternates: { canonical: `/s/${slug}` } };
}

export default async function StorePage({ params, searchParams }: Props) {
  const { slug } = await params; const sp = await searchParams;
  const store = await getStoreBySlug(slug);
  if (!store || store.status !== "active") notFound();
  const [user, result, brands, categories, wished, reviews] = await Promise.all([getSessionUser(), searchProducts(parseListingParams(sp, { storeId: store.id })), getBrands(), getCategories(), getWishlistIds(), getStoreReviews(store.id)]);
  const jsonLd = { "@context": "https://schema.org", "@type": "GroceryStore", name: store.name, telephone: store.phone, address: { "@type": "PostalAddress", streetAddress: store.address_line1, addressLocality: site.city, addressRegion: site.state, postalCode: store.pincode, addressCountry: "IN" }, geo: { "@type": "GeoCoordinates", latitude: store.lat, longitude: store.lng }, openingHours: `Mo-Su ${store.opening_time.slice(0, 5)}-${store.closing_time.slice(0, 5)}`, aggregateRating: store.rating_count ? { "@type": "AggregateRating", ratingValue: store.rating_avg, reviewCount: store.rating_count } : undefined, url: `${site.url}/s/${slug}` };

  return (
    <div className="pt-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="relative mx-4 overflow-hidden rounded-xl border border-line bg-card shadow-card sm:mx-0">
        <div className="h-24 bg-gradient-to-r from-brand-700 to-brand-500 sm:h-32" style={store.cover_url ? { backgroundImage: `url(${store.cover_url})`, backgroundSize: "cover" } : undefined} />
        <div className="-mt-8 flex items-start gap-3 px-4 pb-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border-4 border-card bg-brand-50 text-brand-600 shadow-card">
            {store.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo_url} alt="" className="h-full w-full object-cover" />
            ) : <StoreIcon className="h-7 w-7" />}
          </div>
          <div className="min-w-0 flex-1 pt-10">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold text-ink">{store.name}</h1><Badge tone={store.is_open ? "success" : "neutral"}>{store.is_open ? "Open now" : "Closed"}</Badge></div>
            {store.tagline ? <p className="text-sm text-ink-3">{store.tagline}</p> : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-line px-4 py-3 text-xs text-ink-2 sm:grid-cols-4">
          <span className="inline-flex items-center gap-1.5"><StarRating value={store.rating_avg} count={store.rating_count} /></span>
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-brand-600" />{store.area} · {store.pincode}</span>
          <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-brand-600" />{store.opening_time.slice(0, 5)} – {store.closing_time.slice(0, 5)} · {store.avg_prep_minutes} min prep</span>
          <a href={`tel:${store.phone}`} className="inline-flex items-center gap-1.5 text-brand-700"><Phone className="h-3.5 w-3.5" />Call store</a>
        </div>
        {store.description ? <p className="border-t border-line px-4 py-3 text-sm text-ink-2">{store.description}</p> : null}
      </section>

      <section className="mt-5 px-4 sm:px-0">
        <h2 className="mb-2 text-lg font-bold text-ink">Products at {store.name}</h2>
        <ProductListing result={result} filters={{ brands, categories: categories.filter((c) => !c.parent_id).map((c) => ({ name: c.name, slug: c.slug })) }} signedIn={Boolean(user)} wished={wished} emptyTitle="This store hasn't listed products yet" />
      </section>

      {reviews.length ? (
        <section className="mt-8 px-4 sm:px-0">
          <h2 className="mb-3 text-lg font-bold text-ink">Customer reviews</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {reviews.map((r) => <li key={r.id} className="rounded-lg border border-line bg-card p-4"><StarRating value={r.rating} showValue={false} />{r.title ? <p className="mt-1 text-sm font-semibold text-ink">{r.title}</p> : null}<p className="mt-1 text-sm text-ink-2">{r.comment}</p><p className="mt-2 text-xs text-ink-3">{formatDate(r.created_at)}</p></li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
