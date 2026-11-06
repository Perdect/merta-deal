import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, Clock, MapPin, Navigation, Phone, Truck } from "lucide-react";
import { AppBar } from "@/components/shop/app-bar";
import { ProductGrid } from "@/components/shop/product-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/shared/whatsapp-icon";
import { ServiceRequestForm } from "@/components/services/service-request-form";
import { getProductsByIds, getPublicSettings } from "@/lib/data/catalog";
import { getBusiness, getMenu } from "@/lib/data/directory";
import { DAYS, DAY_LABEL, DIRECTORY, VEG_LABEL, businessJsonLd, hoursText, mapsHref, openNow, profilePath, type BusinessCategory, type MenuItem } from "@/lib/directory";
import { businessFacts, jsonLdHtml } from "@/lib/seo-schema";
import { SERVICE_LINKS } from "@/lib/service-pages";
import { waDigits, waHref } from "@/lib/service-requests";
import { getSessionUser } from "@/lib/supabase/server";
import { site } from "@/config/site";
import { formatINR } from "@/lib/utils";

export type ProfileParams = Promise<{ slug: string }>;

export async function profileMetadata(category: BusinessCategory, params: ProfileParams): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBusiness(category, slug);
  if (!b) return { title: "Page not found", robots: { index: false, follow: false } };
  const d = DIRECTORY[category];
  const title = `${b.name}, ${d.singular} in ${site.city}`;
  const description = (b.description ?? "").slice(0, 155);
  const path = profilePath(b);
  const image = b.photos[0] ?? b.logo_url ?? "/opengraph-image";
  return {
    title, description, alternates: { canonical: path }, robots: { index: true, follow: true },
    openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", url: path, title: `${title} | ${site.seoName}`, description, images: [{ url: image, alt: b.name }] },
    twitter: { card: "summary_large_image", title: `${title} | ${site.seoName}`, description, images: [image] },
  };
}

const action = "tap inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-semibold text-ink hover:border-brand-300";
const h2 = "font-display text-lg font-bold text-ink";

function Menu({ items }: { items: MenuItem[] }) {
  const sections = [...new Set(items.map((i) => i.section ?? ""))];
  return (
    <div className="mt-3 space-y-4">
      {sections.map((s) => (
        <div key={s}>
          {s ? <h3 className="text-sm font-semibold text-ink">{s}</h3> : null}
          <ul className="mt-1.5 divide-y divide-line rounded-lg border border-line bg-card">
            {items.filter((i) => (i.section ?? "") === s).map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-sm">
                <span className="min-w-0"><span className="font-medium text-ink">{i.name}</span>{i.is_veg === true ? <span className="ml-1.5 text-xs text-success">Veg</span> : null}{!i.is_available ? <span className="ml-1.5 text-xs text-ink-3">Not available</span> : null}{i.description ? <span className="block text-xs text-ink-3">{i.description}</span> : null}</span>
                {i.price != null ? <span className="tabular shrink-0 font-semibold text-ink">{formatINR(i.price)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** A published profile. Each block appears only when the business has supplied that detail. */
export async function BusinessProfile({ category, params }: { category: BusinessCategory; params: ProfileParams }) {
  const { slug } = await params;
  const b = await getBusiness(category, slug);
  if (!b) notFound();
  const d = DIRECTORY[category];
  const [menu, settings, user] = await Promise.all([getMenu(b.id), getPublicSettings(), getSessionUser()]);
  const linked = [...new Set(menu.filter((m) => m.product_id && m.is_available).map((m) => m.product_id as string))];
  const products = linked.length ? await getProductsByIds(linked) : [];
  const facts = businessFacts(settings);
  const open = openNow(b);
  const veg = VEG_LABEL[b.veg_type];
  const wa = waDigits(b.whatsapp);
  const tel = b.phone ? `tel:+${b.phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}` : null;
  const rooms = b.category === "hotel" && b.offers_rooms;
  const canOrder = Boolean(d.orderLabel) && b.accepts_delivery;
  // Immediate confirmation is true only for items that go through the shop's own cart.
  const instant = b.order_confirmation === "immediate" && products.length > 0;
  const related = SERVICE_LINKS.filter((l) => d.related.includes(l.slug));
  const days = b.opening_hours ? DAYS : [];

  return (
    <div className="px-4 pb-8 pt-1 sm:px-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(businessJsonLd(b)) }} />
      <AppBar title={b.name} back={d.path} cart className="-mt-1" />
      <nav aria-label="Breadcrumb" className="mt-2 text-xs text-ink-3 max-lg:hidden"><Link href="/" className="tap hover:text-brand-700">Home</Link> / <Link href={d.path} className="tap hover:text-brand-700">{d.plural}</Link> / <span className="text-ink">{b.name}</span></nav>

      <header className="mt-2 flex items-start gap-3">
        {b.logo_url ? <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line"><Image src={b.logo_url} alt={`${b.name} logo`} fill sizes="64px" className="object-cover" /></span> : null}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold leading-tight text-ink">{b.name}</h1>
          <p className="text-sm text-ink-3">{d.singular} in {b.area ? `${b.area}, ` : ""}{site.city}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {b.is_paid_placement ? <Badge tone="warning" size="xs">Paid placement</Badge> : null}
            {open != null ? <Badge tone={open ? "success" : "neutral"} size="xs">{open ? "Open now" : "Closed now"}</Badge> : null}
            {veg ? <Badge tone="success" size="xs">{veg}</Badge> : null}
            {rooms ? <Badge tone="info" size="xs">Rooms available to enquire</Badge> : null}
          </div>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {canOrder ? <Button href="#order" size="lg" className="col-span-2">{d.orderLabel}</Button> : null}
        {rooms ? (wa ? <a href={waHref(wa, `Hi ${b.name}, I found you on ${site.seoName}. I'd like to enquire about rooms.`)} target="_blank" rel="noopener noreferrer" className="tap col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"><BedDouble className="h-4 w-4" aria-hidden />Enquire About Rooms</a> : tel ? <a href={tel} className="tap col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"><BedDouble className="h-4 w-4" aria-hidden />Enquire About Rooms</a> : null) : null}
        {tel ? <a href={tel} className={action}><Phone className="h-4 w-4" aria-hidden />Call</a> : null}
        {wa ? <a href={waHref(wa, `Hi ${b.name}, I found you on ${site.seoName}.`)} target="_blank" rel="noopener noreferrer" className={action}><WhatsAppIcon className="h-4 w-4" />WhatsApp</a> : null}
        <a href={mapsHref(b)} target="_blank" rel="noopener noreferrer" className={action}><Navigation className="h-4 w-4" aria-hidden />Get Directions</a>
      </div>

      {b.description ? <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-ink-2">{b.description}</p> : null}

      {b.photos.length ? (
        <ul className="mt-4 flex gap-2 overflow-x-auto" aria-label={`Photos of ${b.name}`}>
          {b.photos.map((p, i) => <li key={p} className="relative h-44 w-64 shrink-0 overflow-hidden rounded-lg"><Image src={p} alt={`${b.name}, photo ${i + 1}`} fill sizes="256px" className="object-cover" priority={i === 0} /></li>)}
        </ul>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="where">
          <h2 id="where" className={h2}>Address and location</h2>
          <p className="mt-2 flex items-start gap-2 text-sm text-ink-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />{[b.address_line, b.area, site.city, b.pincode].filter(Boolean).join(", ")}</p>
        </section>
        {b.opening_hours && days.length ? (
          <section aria-labelledby="hours">
            <h2 id="hours" className={h2}>Opening hours</h2>
            {!b.hours_verified ? <p className="mt-1 text-xs text-ink-3">As given by the business. Call to confirm.</p> : null}
            <dl className="mt-2 space-y-1 text-sm">{days.map((day) => <div key={day} className="flex justify-between gap-3"><dt className="text-ink-2">{DAY_LABEL[day]}</dt><dd className="tabular text-ink">{hoursText(b.opening_hours?.[day])}</dd></div>)}</dl>
          </section>
        ) : null}
        {b.facilities.length ? <section aria-labelledby="facilities"><h2 id="facilities" className={h2}>Facilities</h2><ul className="mt-2 flex flex-wrap gap-1.5">{b.facilities.map((f) => <li key={f} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-ink-2">{f}</li>)}</ul></section> : null}
        {b.cuisines.length && b.category !== "hotel" ? <section aria-labelledby="cuisine"><h2 id="cuisine" className={h2}>Cuisine</h2><p className="mt-2 text-sm text-ink-2">{b.cuisines.join(", ")}</p></section> : null}
        {b.accepts_delivery ? (
          <section aria-labelledby="delivery">
            <h2 id="delivery" className={h2}>Delivery</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
              <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />Coverage: {b.delivery_coverage}</li>
              <li className="flex gap-2"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />Charge: {b.delivery_charge}</li>
              <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />Estimated time: {b.delivery_eta}</li>
            </ul>
            <p className="mt-2 text-sm font-medium text-ink">{instant ? "Orders are confirmed immediately." : "Orders need the business's approval before they are confirmed."}</p>
          </section>
        ) : null}
      </div>

      {menu.length ? <section className="mt-7" aria-labelledby="menu"><h2 id="menu" className={h2}>{b.category === "bakery" ? "Products" : "Menu"}</h2><Menu items={menu} /></section> : null}

      {canOrder ? (
        <section id="order" className="mt-7 scroll-mt-20">
          {products.length ? <><h2 className={`${h2} mb-3`}>Add to your cart</h2><ProductGrid products={products} signedIn={Boolean(user)} priorityCount={0} /></> : (
            <div className="max-w-3xl"><ServiceRequestForm kind={b.category === "bakery" ? "cake_order" : "food_order"} title={`${d.orderLabel} from ${b.name}`} hindi="ऑर्डर की जानकारी भरें, हम पुष्टि करके बताएंगे।" submit="Send order request" whatsapp={waDigits(settings.support_whatsapp)} tel={facts.tel} phone={facts.phone} context={b.name} /></div>
          )}
        </section>
      ) : null}

      <section className="mt-7" aria-labelledby="related">
        <h2 id="related" className={h2}>Related services</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{related.map((l) => <li key={l.href}><Link href={l.href} className="block h-full rounded-lg border border-line bg-card p-3.5 hover:border-brand-300"><span className="block text-sm font-semibold text-ink">{l.label} in {site.city}</span><span className="mt-0.5 block text-xs text-ink-3">{l.blurb}</span></Link></li>)}</ul>
      </section>
      <p className="mt-6 text-sm text-ink-2">Is this your business? <Link href={`/list-your-business?update=${b.slug}&category=${b.category}`} className="font-semibold text-brand-700 hover:underline">Ask to update this profile</Link>. <Link href={d.path} className="font-semibold text-brand-700 hover:underline">All {d.plural.toLowerCase()}</Link>.</p>
    </div>
  );
}
