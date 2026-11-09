import type { Metadata } from "next";
import Link from "next/link";
import { readCategoryImageManifest, readProductImageManifest } from "@/lib/images/manifest";
import { createClient } from "@/lib/supabase/server";
import { ShopPageHeader } from "@/components/shop/shop-page-header";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "Image credits", description: `Photo sources and licences for product images on ${site.name}.`, alternates: { canonical: "/attributions" } };
export const revalidate = 3600;

export default async function AttributionsPage() {
  const manifest = readProductImageManifest();
  const catManifest = readCategoryImageManifest();
  const supabase = await createClient();
  const { data: cats } = await supabase.from("categories").select("slug, name").in("slug", Object.keys(catManifest));
  const catNames = new Map((cats ?? []).map((c) => [c.slug, c.name]));
  const { data: products } = await supabase.from("products").select("slug, name, pack_label").in("slug", Object.keys(manifest)).limit(2000);
  const names = new Map((products ?? []).map((p) => [p.slug, `${p.name} ${p.pack_label ?? ""}`.trim()]));
  const entries = Object.entries(manifest).sort((a, b) => (names.get(a[0]) ?? a[0]).localeCompare(names.get(b[0]) ?? b[0]));
  const sources = [...new Set(entries.map(([, r]) => r.source))];
  return (
    <div className="px-4 pt-1 sm:px-0">
      <ShopPageHeader title="Image credits" barClassName="-mt-1" subtitle="Product photos are real packaging or commodity photos from open databases, used under their licences." />
      <div className="max-w-3xl space-y-3 text-sm text-ink-2">
        <p>Packaging photographs come from <a className="font-semibold text-brand-700" href="https://world.openfoodfacts.org" rel="noreferrer" target="_blank">Open Food Facts</a> and its sister projects (contributed by their community, <a className="text-brand-700 underline" href="https://creativecommons.org/licenses/by-sa/3.0/" rel="noreferrer" target="_blank">CC BY-SA 3.0</a>). Photos of fresh produce and loose goods come from <a className="font-semibold text-brand-700" href="https://commons.wikimedia.org" rel="noreferrer" target="_blank">Wikimedia Commons</a> under the licence shown for each file. Brand names, logos and packaging artwork remain the property of their respective owners and are shown only to identify the products sold.</p>
        <p className="text-xs text-ink-3">Sources in use: {sources.join(", ") || "none yet"}. Want a photo replaced or credited differently? Write to {site.supportEmail}.</p>
      </div>
      <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-card">
        {entries.map(([slug, r]) => (
          <li key={slug} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <Link href={`/p/${slug}`} className="font-medium text-ink hover:text-brand-700">{names.get(slug) ?? slug}</Link>
            <span className="text-xs text-ink-3">{r.source}{r.attribution ? ` · ${r.attribution}` : ""} · {r.license}{r.source_url ? <> · <a className="text-brand-700 underline" href={r.source_url} rel="noreferrer" target="_blank">source</a></> : null}</span>
          </li>
        ))}
        {entries.length === 0 ? <li className="px-4 py-6 text-center text-sm text-ink-3">No sourced images yet.</li> : null}
      </ul>
      {Object.keys(catManifest).length ? (
        <>
          <h2 className="mt-8 text-base font-bold text-ink">Category photos</h2>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-card">
            {Object.entries(catManifest).map(([slug, r]) => (
              <li key={slug} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <Link href={`/c/${slug}`} className="font-medium text-ink hover:text-brand-700">{catNames.get(slug) ?? slug}</Link>
                <span className="text-xs text-ink-3">{r.matched_name ? `${r.matched_name} · ` : ""}{r.source}{r.attribution ? ` · ${r.attribution}` : ""} · {r.license_url ? <a className="text-brand-700 underline" href={r.license_url} rel="noreferrer" target="_blank">{r.license}</a> : r.license}{r.source_url ? <> · <a className="text-brand-700 underline" href={r.source_url} rel="noreferrer" target="_blank">source</a></> : null}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
