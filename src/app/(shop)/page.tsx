import { getSessionUser } from "@/lib/supabase/server";
import { getWishlistIds, getPublicSettings } from "@/lib/data/catalog";
import { getHomeData, DEFAULT_ESSENTIALS } from "@/lib/data/home";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { CategoryTiles, ProductSection, ServiceStrip } from "@/components/home/home-sections";
import { OfferCarousel } from "@/components/home/offer-strip";
import { LocalIntro } from "@/components/home/local-intro";
import { site } from "@/config/site";
import type { Metadata } from "next";

export const revalidate = 60;

const homeTitle = `${site.seoName} | Grocery, Fruits & Vegetable Delivery in ${site.city}`;
const homeDescription = `Order groceries, fresh fruits and vegetables online in ${site.city}, Rajasthan — atta, dal, rice, oil, sabzi and phal delivered home. Pay by UPI or cash.`;

export const metadata: Metadata = {
  title: { absolute: homeTitle },
  description: homeDescription,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", title: homeTitle, description: homeDescription, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${site.seoName} — grocery delivery in ${site.city}` }] },
};

/** Business identity for search engines: only verified details (no street address until confirmed). */
const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "OnlineStore", "@id": `${site.url}/#organization`, name: site.seoName, alternateName: site.name, url: `${site.url}/`,
      logo: { "@type": "ImageObject", url: `${site.url}/icons/icon-512.png`, width: 512, height: 512 },
      email: site.supportEmail, telephone: "+91-88750-20202", slogan: site.tagline,
      address: { "@type": "PostalAddress", addressLocality: site.city, addressRegion: site.state, postalCode: site.defaultPincode, addressCountry: "IN" },
      areaServed: { "@type": "City", name: site.city, containedInPlace: { "@type": "State", name: site.state } },
      contactPoint: { "@type": "ContactPoint", contactType: "customer service", telephone: "+91-88750-20202", email: site.supportEmail, areaServed: "IN", availableLanguage: ["en", "hi"] },
    },
    { "@type": "WebSite", "@id": `${site.url}/#website`, url: `${site.url}/`, name: site.seoName, alternateName: site.name, inLanguage: "en-IN", publisher: { "@id": `${site.url}/#organization` } },
  ],
};

/**
 * Launch homepage, shopping first: offer strip → category tiles → everyday essentials → fresh
 * vegetables → fresh fruits → grocery essentials → service strip. One concurrent batch of queries;
 * each product appears once.
 */
export default async function HomePage() {
  const settings = await getPublicSettings();
  const essentials = Array.isArray(settings.home_essentials) ? (settings.home_essentials as string[]) : DEFAULT_ESSENTIALS;
  const welcomeCode = typeof settings.welcome_coupon_code === "string" && settings.welcome_coupon_code ? settings.welcome_coupon_code : "WELCOME50";
  const [user, wished, home] = await Promise.all([getSessionUser(), getWishlistIds(), getHomeData(essentials, welcomeCode)]);
  const num = (k: string, d: number) => { const v = Number(settings[k]); return Number.isFinite(v) && v > 0 ? v : d; };
  const etaLabel = `${num("delivery_eta_min_minutes", 20)}–${num("delivery_eta_max_minutes", 25)} min`;
  const signedIn = Boolean(user);

  return (
    <div className="space-y-5 pt-3 sm:space-y-7 sm:pt-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      <h1 className="sr-only">Grocery, fruits and vegetable delivery in {site.city}</h1>
      {home.offers.length ? <OfferCarousel offers={home.offers} /> : null}
      {home.categories.length ? <CategoryTiles categories={home.categories} /> : null}
      {home.sections.length ? (
        home.sections.map((s, i) => <ProductSection key={s.key} section={s} signedIn={signedIn} wished={wished} first={i === 0} />)
      ) : (
        <EmptyState title="Stocking up" description="Products will appear here as soon as they are in stock." action={<Button href="/categories" variant="outline">Browse categories</Button>} compact />
      )}
      <ServiceStrip etaLabel={etaLabel} />
      <LocalIntro etaLabel={etaLabel} />
    </div>
  );
}
