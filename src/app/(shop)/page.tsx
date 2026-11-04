import { getSessionUser } from "@/lib/supabase/server";
import { getPublicSettings } from "@/lib/data/catalog";
import { getHomeData, DEFAULT_ESSENTIALS } from "@/lib/data/home";
import { getCategoryTabs } from "@/lib/data/catalog";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { CategoryGrid, ProductSection, ServiceStrip } from "@/components/home/home-sections";
import { OffersSheet } from "@/components/home/offers-sheet";
import { LocalIntro } from "@/components/home/local-intro";
import { site } from "@/config/site";
import { paymentPhrase } from "@/lib/seo-copy";
import type { Metadata } from "next";

export const revalidate = 60;

const homeTitle = `${site.seoName} | Online Grocery Delivery in ${site.city}`;
const homeH1 = `Online grocery delivery in ${site.city}`;

/** Description states only what the shop offers today: payment wording follows the live settings. */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  const pay = paymentPhrase(settings);
  const homeDescription = `Order groceries, fruits, vegetables and daily essentials online in ${site.city}, Rajasthan with ${site.seoName}. Check delivery availability for your pincode and shop online.${pay ? ` ${pay}` : ""}`;
  return {
    title: { absolute: homeTitle },
    description: homeDescription,
    alternates: { canonical: "/" },
    openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", url: "/", title: homeTitle, description: homeDescription, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${site.seoName} — online grocery delivery in ${site.city}` }] },
  };
}

/**
 * Business identity for search engines (Organization → OnlineStore, as Google recommends for shops).
 * Only verified details: locality-level address (no street until confirmed), the support line, the
 * pincodes we deliver to, and public profiles only once `site.socialProfiles` lists them.
 */
export const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "OnlineStore", "@id": `${site.url}/#organization`, name: site.seoName, alternateName: [site.name, "MertaDeal.com"], url: `${site.url}/`,
      description: `Online grocery delivery service in ${site.city}, Rajasthan: grocery and kirana staples, fresh vegetables, fruits and daily essentials delivered to homes by ${site.seoName}'s own delivery partners.`,
      logo: { "@type": "ImageObject", url: `${site.url}/icons/icon-512.png`, width: 512, height: 512 },
      image: `${site.url}/opengraph-image`,
      email: site.supportEmail, telephone: "+91-88750-20202", slogan: site.tagline,
      address: { "@type": "PostalAddress", addressLocality: site.city, addressRegion: site.state, postalCode: site.defaultPincode, addressCountry: "IN" },
      areaServed: [
        { "@type": "City", name: site.city, containedInPlace: { "@type": "State", name: site.state } },
        // Pincodes as plain text: areaServed accepts Text, and no schema.org Place type models a pincode.
        ...site.servicePincodes.map((code) => `${code}, ${site.city}, ${site.state}, India`),
      ],
      contactPoint: { "@type": "ContactPoint", contactType: "customer service", telephone: "+91-88750-20202", email: site.supportEmail, areaServed: "IN", availableLanguage: ["en", "hi"] },
      knowsLanguage: ["en", "hi"],
      ...(site.socialProfiles.length ? { sameAs: [...site.socialProfiles] } : {}),
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
  const [user, home, tabs] = await Promise.all([getSessionUser(), getHomeData(essentials, welcomeCode), getCategoryTabs().catch(() => [])]);
  const num = (k: string, d: number) => { const v = Number(settings[k]); return Number.isFinite(v) && v > 0 ? v : d; };
  // Headline promise: the quick-commerce single figure (the settings minimum); the window stays in the order promise.
  const etaLabel = `${num("delivery_eta_min_minutes", 20)} min`;
  const signedIn = Boolean(user);

  return (
    <div className="space-y-4 pt-2.5 sm:space-y-7 sm:pt-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      {/* The page's one H1 is visible and says what the service is (one compact line on phones); the shopping sections follow. */}
      <header className="px-4 sm:px-0">
        <h1 className="font-display text-[17px] font-bold leading-tight text-ink sm:text-2xl">{homeH1}</h1>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-2 sm:line-clamp-none sm:text-sm">Grocery, fruits, vegetables and daily essentials delivered to your home in {site.city}, Rajasthan — usually in {etaLabel}.</p>
      </header>
      <OffersSheet offers={home.offers} />
      <CategoryGrid tabs={tabs} fallback={home.categories} />
      {home.sections.length ? (
        home.sections.map((s, i) => <ProductSection key={s.key} section={s} signedIn={signedIn} first={i === 0} />)
      ) : (
        <EmptyState title="Stocking up" description="Products will appear here as soon as they are in stock." action={<Button href="/categories" variant="outline">Browse categories</Button>} compact />
      )}
      <ServiceStrip etaLabel={etaLabel} />
      <LocalIntro etaLabel={etaLabel} />
    </div>
  );
}
