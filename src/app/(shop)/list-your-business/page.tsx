import type { Metadata } from "next";
import Link from "next/link";
import { AppBar } from "@/components/shop/app-bar";
import { ListingForm } from "@/components/directory/listing-form";
import { getPublicSettings } from "@/lib/data/catalog";
import { BUSINESS_CATEGORIES, DIRECTORY, type BusinessCategory } from "@/lib/directory";
import { businessFacts } from "@/lib/seo-schema";
import { site } from "@/config/site";

const title = `List Your Hotel, Restaurant or Bakery in ${site.city}`;
const description = `Run a hotel, restaurant or bakery in ${site.city}? Ask ${site.seoName} to list your business. We verify every profile before it goes live.`;

export const metadata: Metadata = {
  title, description, alternates: { canonical: "/list-your-business" },
  openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", url: "/list-your-business", title, description, images: [{ url: "/og/merta-deal-share.jpg", width: 1200, height: 630, alt: `${site.seoName}, ${site.city}` }] },
};

export default async function ListYourBusinessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, settings] = await Promise.all([searchParams, getPublicSettings()]);
  const b = businessFacts(settings);
  const update = typeof sp.update === "string" && /^[a-z0-9-]+$/.test(sp.update) ? sp.update : undefined;
  const category = BUSINESS_CATEGORIES.find((c) => c === sp.category) as BusinessCategory | undefined;
  return (
    <div className="px-4 pb-8 pt-1 sm:px-0">
      <AppBar title="List your business" back="/" cart className="-mt-1" />
      <div className="max-w-3xl">
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink lg:mt-3">{update ? "Update your business profile" : `List your business in ${site.city}`}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Customers use {site.seoName} to find <Link href={DIRECTORY.restaurant.path} className="font-semibold text-brand-700 hover:underline">restaurants</Link>, <Link href={DIRECTORY.bakery.path} className="font-semibold text-brand-700 hover:underline">bakeries</Link> and <Link href={DIRECTORY.hotel.path} className="font-semibold text-brand-700 hover:underline">hotels</Link> in {site.city}. Send your details and we&apos;ll call to verify them.</p>
        <p lang="hi" className="mt-1.5 text-sm text-ink-3">{site.cityHindi} में अपना होटल, रेस्टोरेंट या बेकरी जोड़ें। जाँच के बाद ही प्रोफ़ाइल दिखेगी।</p>
        <div className="mt-4"><ListingForm category={category} updateSlug={update} tel={b.tel} phone={b.phone} /></div>
        <section className="mt-6" aria-labelledby="how">
          <h2 id="how" className="font-display text-lg font-bold text-ink">What happens next</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
            <li>We call the number you give us to verify the business.</li>
            <li>You send your logo, photos, timings and menu or product list.</li>
            <li>We build your profile and check that it&apos;s complete.</li>
            <li>It goes live, and you can ask us to change it at any time.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
