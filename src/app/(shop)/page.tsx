import { getPublicSettings, getCategories } from "@/lib/data/catalog";
import { businessNode, jsonLdHtml } from "@/lib/seo-schema";
import { getHomeData, DEFAULT_ESSENTIALS } from "@/lib/data/home";
import { getCategoryTabs, getHomeBanners } from "@/lib/data/catalog";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { WelcomeOfferLine } from "@/components/home/welcome-offer";
import { ProductSection, ServiceStrip } from "@/components/home/home-sections";
import { CakeRequest, LocalIntro } from "@/components/home/local-intro";
import { HomeBrowse } from "@/components/home/home-browse";
import { BannerCarousel } from "@/components/shop/banner-carousel";
import { site } from "@/config/site";
import { paymentPhrase } from "@/lib/seo-copy";
import type { Metadata } from "next";

export const revalidate = 60;

/** "grocery, sweets and fast food" — the categories on sale, so the copy never promises a paused one. */
const listNames = (names: string[]) => { const n = names.length ? names : ["grocery"]; return n.length === 1 ? `${n[0]} and daily essentials` : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`; };
const capitalise = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const homeTitle = `${site.seoName} | Online Grocery Delivery in ${site.city}`;
const homeH1 = `Online grocery delivery in ${site.city}`;

/** Description states only what the shop offers today: payment wording follows the live settings. */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  const pay = paymentPhrase(settings);
  const cats = (await getCategories()).filter((c) => !c.parent_id).map((c) => c.name.toLowerCase());
  const homeDescription = `Order ${listNames(cats)} online in ${site.city}, Rajasthan with ${site.seoName}. Check delivery availability for your pincode and shop online.${pay ? ` ${pay}` : ""}`;
  return {
    title: { absolute: homeTitle },
    description: homeDescription,
    alternates: { canonical: "/" },
    openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", url: "/", title: homeTitle, description: homeDescription, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${site.seoName} — online grocery delivery in ${site.city}` }] },
  };
}

/** Business identity (shared with the service pages) and the site itself, for search engines. */
const homeJsonLd = (settings: Record<string, unknown>) => ({
  "@context": "https://schema.org",
  "@graph": [
    businessNode(settings),
    { "@type": "WebSite", "@id": `${site.url}/#website`, url: `${site.url}/`, name: site.seoName, alternateName: site.name, inLanguage: "en-IN", publisher: { "@id": `${site.url}/#organization` } },
  ],
});

/**
 * Launch homepage, shopping first: offer strip → category tiles → everyday essentials → fresh
 * the product sections → service strip. One concurrent batch of queries;
 * each product appears once.
 */
export default async function HomePage() {
  const settings = await getPublicSettings();
  const essentials = Array.isArray(settings.home_essentials) ? (settings.home_essentials as string[]) : DEFAULT_ESSENTIALS;
  const welcomeCode = typeof settings.welcome_coupon_code === "string" && settings.welcome_coupon_code ? settings.welcome_coupon_code : "WELCOME50";
  const [home, tabs, banners] = await Promise.all([getHomeData(essentials, welcomeCode), getCategoryTabs().catch(() => []), getHomeBanners().catch(() => [])]);
  // If the tile query fails the rail still lists the lines, from the home feed's own category list.
  const railTabs = tabs.length ? tabs : home.categories.map((c) => ({ id: c.id, slug: c.slug, name: c.name, image: c.images[0] ?? null, color: c.color, count: 0, tiles: [] }));
  const num = (k: string, d: number) => { const v = Number(settings[k]); return Number.isFinite(v) && v > 0 ? v : d; };
  // Headline promise: the quick-commerce single figure (the settings minimum); the window stays in the order promise.
  const etaLabel = `${num("delivery_eta_min_minutes", 20)} min`;

  return (
    <div className="space-y-4 pt-2.5 sm:space-y-7 sm:pt-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(homeJsonLd(settings)) }} />
      {/* The page's one H1 is visible and says what the service is (one compact line on phones); the shopping sections follow. */}
      <header className="px-4 sm:px-0">
        <h1 className="font-display text-[17px] font-bold leading-tight text-ink sm:text-2xl">{homeH1}</h1>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-2 sm:line-clamp-none sm:text-sm">{capitalise(listNames(home.categories.map((c) => c.name.toLowerCase())))} delivered to your home in {site.city}, Rajasthan, with a {etaLabel} delivery target.</p>
      </header>
      <WelcomeOfferLine offers={home.offers} />
      {home.sections.length ? (
        <HomeBrowse
          tabs={railTabs}
          banner={<BannerCarousel banners={banners} />}
          items={home.sections.map((s, i) => ({ key: s.key, node: <ProductSection section={s} first={i === 0} /> }))}
        />
      ) : (
        <>
          <BannerCarousel banners={banners} />
          <EmptyState title="Stocking up" description="Products will appear here as soon as they are in stock." action={<Button href="/categories" variant="outline">Browse categories</Button>} compact />
        </>
      )}
      <CakeRequest />
      <ServiceStrip etaLabel={etaLabel} />
      <LocalIntro etaLabel={etaLabel} produce={home.categories.some((c) => c.slug === "fruits" || c.slug === "vegetables")} />
    </div>
  );
}
