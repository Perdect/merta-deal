import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { AppBar } from "@/components/shop/app-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { listBusinesses } from "@/lib/data/directory";
import { BUSINESS_CATEGORIES, DIRECTORY, VEG_LABEL, openNow, profilePath, type Business, type BusinessCategory } from "@/lib/directory";
import { jsonLdHtml } from "@/lib/seo-schema";
import { SERVICE_LINKS } from "@/lib/service-pages";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

export type DirectorySearch = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** An empty directory stays out of search results; filtered views point at the plain page. */
export async function directoryMetadata(category: BusinessCategory, searchParams: DirectorySearch): Promise<Metadata> {
  const d = DIRECTORY[category];
  const [sp, items] = await Promise.all([searchParams, listBusinesses(category)]);
  const filtered = Object.values(sp).some((v) => one(v));
  return {
    title: d.title, description: d.description, alternates: { canonical: d.path },
    robots: items.length && !filtered ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", url: d.path, title: `${d.title} | ${site.seoName}`, description: d.description, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${site.seoName}, ${site.city}` }] },
    twitter: { card: "summary_large_image", title: `${d.title} | ${site.seoName}`, description: d.description, images: ["/opengraph-image"] },
  };
}

function Card({ b }: { b: Business }) {
  const open = openNow(b);
  const veg = VEG_LABEL[b.veg_type];
  return (
    <li>
      <Link href={profilePath(b)} className="flex h-full gap-3 rounded-lg border border-line bg-card p-3.5 shadow-card hover:border-brand-300">
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
          {b.logo_url || b.photos[0] ? <Image src={b.logo_url ?? b.photos[0]} alt="" fill sizes="64px" className="object-cover" /> : <Building2 className="absolute inset-0 m-auto h-6 w-6 text-ink-4" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-bold text-ink">{b.name}</span>
          <span className="block truncate text-xs text-ink-3">{[b.area, b.cuisines.slice(0, 3).join(", ")].filter(Boolean).join(" · ")}</span>
          <span className="mt-1.5 flex flex-wrap gap-1">
            {b.is_paid_placement ? <Badge tone="warning" size="xs">Paid placement</Badge> : null}
            {open != null ? <Badge tone={open ? "success" : "neutral"} size="xs">{open ? "Open now" : "Closed now"}</Badge> : null}
            {veg ? <Badge tone="success" size="xs">{veg}</Badge> : null}
            {b.accepts_delivery ? <Badge tone="info" size="xs">Delivers</Badge> : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** One directory: live results, server-side filters that work without JavaScript, and a clear path to get listed. */
export async function DirectoryPage({ category, searchParams }: { category: BusinessCategory; searchParams: DirectorySearch }) {
  const d = DIRECTORY[category];
  const [sp, all] = await Promise.all([searchParams, listBusinesses(category)]);
  const q = one(sp.q).trim().toLowerCase(); const cuisine = one(sp.cuisine); const veg = one(sp.veg) === "1"; const delivery = one(sp.delivery) === "1"; const openOnly = one(sp.open) === "1";
  const cuisines = [...new Set(all.flatMap((b) => b.cuisines))].sort();
  const hasHours = all.some((b) => openNow(b) != null);
  const items = all.filter((b) => (!q || b.name.toLowerCase().includes(q)) && (!cuisine || b.cuisines.includes(cuisine)) && (!veg || b.veg_type !== "not_stated") && (!delivery || b.accepts_delivery) && (!openOnly || openNow(b) === true));
  const related = SERVICE_LINKS.filter((l) => d.related.includes(l.slug));
  const url = `${site.url}${d.path}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": `${url}#page`, url, name: d.title, description: d.description, inLanguage: "en-IN", isPartOf: { "@id": `${site.url}/#website` } },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${site.url}/` }, { "@type": "ListItem", position: 2, name: d.plural, item: url }] },
      ...(all.length ? [{ "@type": "ItemList", itemListElement: all.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, url: `${site.url}${profilePath(b)}` })) }] : []),
    ],
  };

  return (
    <div className="px-4 pb-8 pt-1 sm:px-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <AppBar title={d.plural} back="/" cart className="-mt-1" />
      <nav aria-label="Breadcrumb" className="mt-2 text-xs text-ink-3 max-lg:hidden"><Link href="/" className="tap hover:text-brand-700">Home</Link> / <span className="text-ink">{d.plural}</span></nav>
      <header className="max-w-3xl">
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink lg:mt-3">{d.h1}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{d.intro}</p>
        <p lang="hi" className="mt-1.5 text-sm text-ink-3">{d.hindi}</p>
      </header>

      <nav aria-label="Business category" className="mt-4 flex gap-2 overflow-x-auto">
        {BUSINESS_CATEGORIES.map((c) => <Link key={c} href={DIRECTORY[c].path} aria-current={c === category ? "page" : undefined} className={cn("tap inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold", c === category ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-card text-ink-2")}>{DIRECTORY[c].plural}</Link>)}
      </nav>

      {all.length ? (
        <form method="get" className="mt-4 grid gap-3 rounded-lg border border-line bg-card p-3.5 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <Input label="Search by name" name="q" defaultValue={one(sp.q)} leftIcon={<Search className="h-4 w-4" aria-hidden />} />
          {cuisines.length ? <Select label={category === "hotel" ? "Food served" : "Cuisine"} name="cuisine" placeholder="Any" options={cuisines.map((c) => ({ value: c, label: c }))} defaultValue={cuisine} /> : null}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {category !== "hotel" ? <Checkbox label="Vegetarian options" name="veg" value="1" defaultChecked={veg} /> : null}
            {category !== "hotel" ? <Checkbox label="Delivers" name="delivery" value="1" defaultChecked={delivery} /> : null}
            {hasHours ? <Checkbox label="Open now" name="open" value="1" defaultChecked={openOnly} /> : null}
          </div>
          <Button type="submit" variant="outline">Apply</Button>
        </form>
      ) : null}

      {items.length ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((b) => <Card key={b.id} b={b} />)}</ul>
      ) : (
        <div className="mt-5 rounded-lg border border-line bg-card p-5 text-center">
          <p className="font-display text-base font-bold text-ink">{all.length ? "Nothing matches those filters" : `No ${d.plural.toLowerCase()} are listed yet`}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">{all.length ? "Try a different name or remove a filter." : `We only list businesses that have confirmed their details with us. Own a ${d.singular.toLowerCase()} in ${site.city}?`}</p>
          {all.length ? <Button href={d.path} variant="outline" className="mt-3">Clear filters</Button> : <Button href="/list-your-business" className="mt-3">List your business</Button>}
        </div>
      )}

      <section className="mt-7" aria-labelledby="dir-related">
        <h2 id="dir-related" className="font-display text-lg font-bold text-ink">Related services</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{related.map((l) => <li key={l.href}><Link href={l.href} className="block h-full rounded-lg border border-line bg-card p-3.5 hover:border-brand-300"><span className="block text-sm font-semibold text-ink">{l.label} in {site.city}</span><span className="mt-0.5 block text-xs text-ink-3">{l.blurb}</span></Link></li>)}</ul>
      </section>
      {all.length ? <p className="mt-6 text-sm text-ink-2">Run a business in {site.city}? <Link href="/list-your-business" className="font-semibold text-brand-700 hover:underline">List your business</Link>.</p> : null}
    </div>
  );
}
