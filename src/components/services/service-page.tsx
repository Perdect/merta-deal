import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Bike, ChevronRight, CircleAlert, Clock, IndianRupee, Mail, MapPin, Phone, Wallet, type LucideIcon } from "lucide-react";
import { AppBar } from "@/components/shop/app-bar";
import { ProductGrid } from "@/components/shop/product-card";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/shared/whatsapp-icon";
import { ServiceRequestForm } from "@/components/services/service-request-form";
import { getPublicSettings, searchProducts } from "@/lib/data/catalog";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { paymentPhrase } from "@/lib/seo-copy";
import { businessFacts, businessNode, jsonLdHtml } from "@/lib/seo-schema";
import { SERVICE_LINKS, serviceCopy, type ServiceContext, type ServiceCopy, type ServiceSlug } from "@/lib/service-pages";
import { waDigits, waHref } from "@/lib/service-requests";
import { site } from "@/config/site";
import { formatINR } from "@/lib/utils";

const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const time12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${(((h % 24) + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h % 24 < 12 ? "am" : "pm"}`; };
const listOf = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** Everything these pages state about hours, coverage and timing comes from settings and delivery_zones. */
const loadContext = cache(async () => {
  const supabase = await createClient();
  const [settings, zonesRes] = await Promise.all([
    getPublicSettings(),
    supabase.from("delivery_zones").select("name, pincode, express_supported").eq("is_active", true).order("name"),
  ]);
  const zones = zonesRes.data ?? [];
  const facts = businessFacts(settings);
  const pincodes = [...new Set(zones.map((z) => z.pincode).filter(Boolean))] as string[];
  const expressZones = zones.filter((z) => z.express_supported).map((z) => z.name);
  const pickupFrom = num(settings.pickup_drop_min_charge, 0);
  const ctx: ServiceContext = {
    target: num(settings.delivery_eta_min_minutes, 20),
    hours: facts.hours ? `${time12(facts.hours.open)} – ${time12(facts.hours.close)}` : null,
    coverage: zones.length ? `${site.city}: ${listOf(zones.map((z) => z.name))} (pincode${pincodes.length > 1 ? "s" : ""} ${pincodes.join(", ")})` : null,
    pay: paymentPhrase(settings),
    maxQty: num(settings.default_max_order_qty, 5),
    express: expressZones.length ? { eta: `${num(settings.express_eta_min_minutes, 12)}–${num(settings.express_eta_max_minutes, 18)} min`, fee: formatINR(num(settings.express_delivery_fee, 0)), zones: listOf(expressZones) } : null,
    pickupFrom: pickupFrom ? `from ${formatINR(pickupFrom)}` : null,
  };
  return { settings, facts, ctx, pincodes };
});

export async function serviceMetadata(slug: ServiceSlug): Promise<Metadata> {
  const { ctx } = await loadContext();
  const { title, description } = serviceCopy(slug, ctx);
  const shareTitle = `${title} | ${site.seoName}`;
  const image = { url: "/opengraph-image", width: 1200, height: 630, alt: `${site.seoName}, ${site.city}` };
  return {
    title, description,
    alternates: { canonical: `/${slug}` },
    robots: { index: true, follow: true },
    openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", url: `/${slug}`, title: shareTitle, description, images: [image] },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: [image.url] },
  };
}

function structuredData(slug: ServiceSlug, copy: ServiceCopy, settings: Record<string, unknown>) {
  const url = `${site.url}/${slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      businessNode(settings),
      { "@type": "WebPage", "@id": `${url}#page`, url, name: copy.title, description: copy.description, inLanguage: "en-IN", isPartOf: { "@id": `${site.url}/#website` }, about: { "@id": `${url}#service` } },
      { "@type": "Service", "@id": `${url}#service`, name: copy.h1, serviceType: copy.serviceType, description: copy.description, url, provider: { "@id": `${site.url}/#organization` }, areaServed: { "@type": "City", name: site.city, containedInPlace: { "@type": "State", name: site.state } } },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${site.url}/` }, { "@type": "ListItem", position: 2, name: copy.crumb, item: url }] },
      { "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: copy.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
}

type Contact = { tel: string; phone: string; whatsapp: string | null; whatsappText: string };

function ContactButtons({ order, contact }: { order?: { label: string; href: string }; contact: Contact }) {
  const secondary = "tap inline-flex h-12 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {order ? <Button href={order.href} size="lg" className="col-span-2">{order.label}</Button> : null}
      <a href={contact.tel} aria-label={`Call ${contact.phone}`} className={`${secondary} border border-line bg-card text-ink hover:border-brand-300`}><Phone className="h-4 w-4" aria-hidden />Call<span className="hidden sm:inline"> {contact.phone}</span></a>
      {contact.whatsapp ? <a href={waHref(contact.whatsapp, contact.whatsappText)} target="_blank" rel="noopener noreferrer" className={`${secondary} bg-[#1a7f4b] text-white hover:bg-[#156a3e]`}><WhatsAppIcon className="h-4 w-4" />WhatsApp</a> : null}
    </div>
  );
}

function Fact({ icon: Icon, title, text, href }: { icon: LucideIcon; title: string; text: string; href?: string }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-line bg-card p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-4 w-4" aria-hidden /></span>
      <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{title}</span><span className="block text-sm text-ink-2">{href ? <Link href={href} className="font-medium text-brand-700 hover:underline">{text}</Link> : text}</span></span>
    </li>
  );
}

const h2 = "font-display text-lg font-bold text-ink";

/** One template for the five local service pages; every word on them comes from `serviceCopy` and live settings. */
export async function ServicePage({ slug }: { slug: ServiceSlug }) {
  const { settings, facts, ctx, pincodes } = await loadContext();
  const copy = serviceCopy(slug, ctx);
  const [user, listing] = await Promise.all([getSessionUser(), copy.category ? searchProducts({ category: copy.category.slug, pageSize: 8 }) : Promise.resolve(null)]);
  // The catalogue decides: until a category with products exists, ordering runs through the request form.
  const products = listing?.items ?? [];
  const order = copy.category && products.length ? { label: copy.category.label, href: `/c/${copy.category.slug}` } : copy.order;
  const contact: Contact = { tel: facts.tel, phone: facts.phone, whatsapp: waDigits(settings.support_whatsapp), whatsappText: copy.whatsappText };
  const pickupDrop = slug === "delivery-boy-merta-city";
  const charge = slug === "bulk-gifts-sweets-merta-city" ? "Stated in your quotation" : pickupDrop ? (ctx.pickupFrom ? `Starts ${ctx.pickupFrom}, confirmed before booking` : "Confirmed before booking") : "Shown before you confirm";
  const related = SERVICE_LINKS.filter((l) => copy.related.includes(l.slug));

  return (
    <div className="px-4 pb-8 pt-1 sm:px-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(structuredData(slug, copy, settings)) }} />
      <AppBar title={copy.crumb} back="/" cart className="-mt-1" />
      <nav aria-label="Breadcrumb" className="mt-2 text-xs text-ink-3 max-lg:hidden"><Link href="/" className="tap hover:text-brand-700">Home</Link> / <span className="text-ink">{copy.crumb}</span></nav>

      <header className="max-w-3xl">
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink lg:mt-3">{copy.h1}</h1>
        {copy.intro.map((p) => <p key={p} className="mt-2 text-[15px] leading-relaxed text-ink-2">{p}</p>)}
        <p lang="hi" className="mt-2 text-sm leading-relaxed text-ink-3">{copy.hindi}</p>
      </header>
      {copy.notice ? <p className="mt-3 flex max-w-3xl items-start gap-2 rounded-lg bg-saffron-50 p-3 text-sm font-medium text-ink"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-saffron-700" aria-hidden />{copy.notice}</p> : null}
      <div className="mt-4"><ContactButtons order={order} contact={contact} /></div>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {pickupDrop ? <Fact icon={Bike} title="Rider availability" text="Check availability" href="#request" /> : null}
        {ctx.hours ? <Fact icon={Clock} title="Order hours" text={`${ctx.hours}, every day`} /> : null}
        <Fact icon={MapPin} title="Delivery area" text={`${site.city}${pincodes.length ? `, ${pincodes.join(", ")}` : ""}`} href="/delivery-area" />
        <Fact icon={IndianRupee} title={pickupDrop ? "Delivery charge" : "Charges"} text={charge} />
        {!pickupDrop && ctx.pay ? <Fact icon={Wallet} title="Payment" text={slug === "bulk-gifts-sweets-merta-city" ? "Terms stated in your quotation" : ctx.pay} /> : null}
      </ul>

      {products.length ? (
        <section className="mt-7" aria-labelledby="products"><h2 id="products" className={`${h2} mb-3`}>Available now</h2><ProductGrid products={products} signedIn={Boolean(user)} priorityCount={0} /></section>
      ) : null}

      {copy.form ? (
        <section id="request" className="mt-7 max-w-3xl scroll-mt-20">
          <ServiceRequestForm kind={copy.form.kind} title={copy.form.title} hindi={copy.form.hindi} submit={copy.form.submit} destination={copy.form.destination} whatsapp={contact.whatsapp} tel={contact.tel} phone={contact.phone} />
        </section>
      ) : null}

      {copy.extra ? (
        <section className="mt-7" aria-labelledby="extra">
          <h2 id="extra" className={h2}>{copy.extra.title}</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {copy.extra.items.map((o) => <li key={o.t} className="rounded-lg border border-line bg-card p-3.5"><h3 className="text-sm font-semibold text-ink">{o.t}</h3><p className="mt-0.5 text-sm text-ink-2">{o.s}</p></li>)}
          </ul>
        </section>
      ) : null}

      <section className="mt-7" aria-labelledby="offers">
        <h2 id="offers" className={h2}>{copy.offersTitle}</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {copy.offers.map((o) => <li key={o.t} className="rounded-lg border border-line bg-card p-3.5"><h3 className="text-sm font-semibold text-ink">{o.t}</h3><p className="mt-0.5 text-sm text-ink-2">{o.s}</p></li>)}
        </ul>
      </section>

      <section className="mt-7" aria-labelledby="steps">
        <h2 id="steps" className={h2}>{copy.stepsTitle}</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {copy.steps.map((s, i) => (
            <li key={s.t} className="rounded-lg border border-line bg-card p-3.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700" aria-hidden>{i + 1}</span>
              <h3 className="mt-2 text-sm font-semibold text-ink">{s.t}</h3><p className="mt-0.5 text-sm text-ink-2">{s.s}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-7 max-w-3xl" aria-labelledby="conditions">
        <h2 id="conditions" className={h2}>{copy.conditionsTitle}</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">{copy.conditions.map((c) => <li key={c}>{c}</li>)}</ul>
      </section>

      <section className="mt-7 max-w-3xl" aria-labelledby="faq">
        <h2 id="faq" className={h2}>Questions people ask</h2>
        <div className="mt-3 divide-y divide-line rounded-lg border border-line bg-card">
          {copy.faqs.map((f) => (
            <details key={f.q} className="group px-3.5">
              <summary className="tap flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">{f.q}<ChevronRight className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-open:rotate-90" aria-hidden /></summary>
              <p className="pb-3 text-sm text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {copy.shopLinks?.length ? (
        <nav className="mt-7" aria-labelledby="browse">
          <h2 id="browse" className={h2}>Browse</h2>
          <ul className="mt-3 flex flex-wrap gap-2">{copy.shopLinks.map((l) => <li key={l.href}><Link href={l.href} className="tap inline-flex min-h-11 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink hover:border-brand-300">{l.label}</Link></li>)}</ul>
        </nav>
      ) : null}

      <section className="mt-7" aria-labelledby="related">
        <h2 id="related" className={h2}>Related services</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {related.map((l) => <li key={l.href}><Link href={l.href} className="block h-full rounded-lg border border-line bg-card p-3.5 hover:border-brand-300"><span className="block text-sm font-semibold text-ink">{l.label} in {site.city}</span><span className="mt-0.5 block text-xs text-ink-3">{l.blurb}</span></Link></li>)}
          <li><Link href={pickupDrop ? "/deliver" : "/delivery-area"} className="block h-full rounded-lg border border-line bg-card p-3.5 hover:border-brand-300"><span className="block text-sm font-semibold text-ink">{pickupDrop ? `Deliver with ${site.name}` : "Delivery area & charges"}</span><span className="mt-0.5 block text-xs text-ink-3">{pickupDrop ? "Apply to work as a delivery partner" : "Areas, pincodes and timings"}</span></Link></li>
        </ul>
      </section>

      <section className="mt-7 rounded-lg border border-line bg-card p-4" aria-labelledby="contact">
        <h2 id="contact" className={h2}>Talk to {site.seoName}</h2>
        <p lang="hi" className="mt-0.5 text-sm text-ink-3">कॉल या WhatsApp करें, हम हिंदी में बात करते हैं।</p>
        <div className="mt-3"><ContactButtons order={order} contact={contact} /></div>
        <ul className="mt-3 space-y-1 text-sm text-ink-2">
          <li className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-ink-3" aria-hidden /><a href={`mailto:${facts.email}`} className="font-medium text-brand-700 hover:underline">{facts.email}</a></li>
          <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />{facts.street ? `${facts.street}, ` : ""}{site.city}, {site.state} {site.defaultPincode}</li>
        </ul>
        {facts.fssai && (copy.category || slug === "bulk-gifts-sweets-merta-city") ? <p className="mt-2 text-xs text-ink-3">FSSAI licence no. {facts.fssai}</p> : null}
      </section>
    </div>
  );
}
