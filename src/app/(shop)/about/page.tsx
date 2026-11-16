import type { Metadata } from "next";
import Link from "next/link";
import { Clock, MapPin, Phone, Truck, Wallet } from "lucide-react";
import { AppBar } from "@/components/shop/app-bar";
import { createClient } from "@/lib/supabase/server";
import { getPublicSettings } from "@/lib/data/catalog";
import { paymentPhrase } from "@/lib/seo-copy";
import { site } from "@/config/site";

const title = `About ${site.seoName} – Online Grocery Delivery in ${site.city}`;
const description = `${site.descriptionShort} Orders are delivered to your home by our own delivery partners.`;

export const metadata: Metadata = {
  title: { absolute: `${title} | ${site.seoName}` },
  description,
  alternates: { canonical: "/about" },
  openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", title, description, url: "/about" },
};

const time12 = (t: string | null | undefined) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${(((h % 24) + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h % 24 < 12 ? "am" : "pm"}`;
};
const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/**
 * Who we are, in plain words, built from the same data the shop runs on (settings, delivery zones):
 * nothing here is typed in that could drift from what customers actually get.
 */
export default async function AboutPage() {
  const supabase = await createClient();
  const [settings, zonesRes] = await Promise.all([
    getPublicSettings(),
    supabase.from("delivery_zones").select("name, area, pincode").eq("is_active", true).order("name"),
  ]);
  const zones = zonesRes.data ?? [];
  const hours = (settings.business_hours ?? {}) as { open?: string; close?: string };
  const opens = time12(hours.open); const closes = time12(hours.close);
  const eta = `${num(settings.delivery_eta_min_minutes, 20)}–${num(settings.delivery_eta_max_minutes, 25)} minutes`;
  const pickup = (settings.pickup_point ?? {}) as { area?: string | null; pincode?: string | null };
  const phone = typeof settings.support_phone === "string" && settings.support_phone ? settings.support_phone : site.supportPhone;
  const email = typeof settings.support_email === "string" && settings.support_email ? settings.support_email : site.supportEmail;
  const telHref = `tel:+${phone.replace(/\D/g, "").replace(/^0+/, "").replace(/^(?!91)/, "91")}`;
  const pay = paymentPhrase(settings);
  const pincodes = [...new Set(zones.map((z) => z.pincode).filter(Boolean))] as string[];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "AboutPage", "@id": `${site.url}/about#page`, url: `${site.url}/about`, name: title, description, isPartOf: { "@id": `${site.url}/#website` }, about: { "@id": `${site.url}/#organization` }, mainEntity: { "@id": `${site.url}/#organization` } },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${site.url}/` }, { "@type": "ListItem", position: 2, name: `About ${site.seoName}`, item: `${site.url}/about` }] },
    ],
  };
  const link = "font-semibold text-brand-700 hover:underline";

  return (
    <div className="px-4 pb-8 pt-1 sm:px-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <AppBar title={`About ${site.seoName}`} back="/" cart className="-mt-1" />
      <nav aria-label="Breadcrumb" className="mt-2 text-xs text-ink-3 max-lg:hidden"><Link href="/" className="tap hover:text-brand-700">Home</Link> / <span className="text-ink">About</span></nav>

      <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink lg:mt-3">About {site.seoName}</h1>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-2">
        {site.seoName} (also written Merta Deal) is an online <Link href="/c/grocery" className={link}>grocery</Link>, <Link href="/c/sweets" className={link}>sweets</Link>, <Link href="/c/sweets" className={link}>cakes and bakery items</Link>, and <Link href="/c/grocery" className={link}>dry fruits</Link> home delivery service operating in {site.city}, Rajasthan. You order on this website or the installed app, and our own delivery partners bring it to your door.
      </p>
      <p lang="hi" className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-3">{site.cityHindi} ({site.cityHindiAlt}) में किराना, मिठाई, केक, बेकरी और ड्राई फ्रूट्स की ऑनलाइन होम डिलीवरी — ऑर्डर वेबसाइट या ऐप से करें, डिलीवरी हमारे अपने डिलीवरी पार्टनर करते हैं।</p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        <Fact icon={Truck} title="How delivery works" text={`Orders are packed by ${site.seoName}, and our delivery target is ${eta} from ordering. It depends on stock, preparation, distance and rider availability. The charge and estimate for your address are shown before you confirm.`} />
        {opens && closes ? <Fact icon={Clock} title="Hours" text={`${opens} – ${closes}, every day`} /> : null}
        <Fact icon={MapPin} title="Where we deliver" text={zones.length ? `${zones.map((z) => z.name).join(", ")} (pincode${pincodes.length > 1 ? "s" : ""} ${pincodes.join(", ")}).` : `${site.city}, Rajasthan.`} />
        {pay ? <Fact icon={Wallet} title="Payment" text={pay} /> : null}
      </ul>

      <section className="mt-6" aria-labelledby="contact">
        <h2 id="contact" className="font-display text-lg font-bold text-ink">Contact {site.seoName}</h2>
        <ul className="mt-2 space-y-1.5 text-[15px] text-ink-2">
          <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-ink-3" aria-hidden /><a href={telHref} className={link}>{phone}</a></li>
          <li className="flex items-center gap-2"><span className="w-4 text-center text-ink-3" aria-hidden>@</span><a href={`mailto:${email}`} className={link}>{email}</a></li>
          <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-ink-3" aria-hidden />{pickup.area ? `${pickup.area}, ` : ""}{site.city}, Rajasthan{pickup.pincode ? ` ${pickup.pincode}` : ""}</li>
        </ul>
        <p className="mt-2 text-sm text-ink-3">Signed-in customers can also write to us from <Link href="/account/support" className={link}>Help &amp; support</Link>, where every order has its own ticket.</p>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="More">
        <Link href="/delivery-area" className="rounded-xl border border-line bg-card p-4 text-sm font-semibold text-ink hover:border-brand-300">Delivery area &amp; charges →</Link>
        <Link href="/categories" className="rounded-xl border border-line bg-card p-4 text-sm font-semibold text-ink hover:border-brand-300">Shop by category →</Link>
        <Link href="/terms" className="rounded-xl border border-line bg-card p-4 text-sm font-semibold text-ink hover:border-brand-300">Terms, refunds &amp; cancellations →</Link>
      </section>
    </div>
  );
}

function Fact({ icon: Icon, title, text }: { icon: typeof Clock; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-line bg-card p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-4 w-4" aria-hidden /></span>
      <span><span className="block text-sm font-semibold text-ink">{title}</span><span className="block text-sm text-ink-2">{text}</span></span>
    </li>
  );
}
