import type { Metadata } from "next";
import Link from "next/link";
import { AppBar } from "@/components/shop/app-bar";
import { Clock, IndianRupee, Truck, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveCategorySlugs, getPublicSettings } from "@/lib/data/catalog";
import { site } from "@/config/site";
import { formatINR } from "@/lib/utils";

const title = `Delivery Area, Charges & Timings in ${site.city}`;
const description = `Where ${site.seoName} delivers in ${site.city}, Rajasthan: areas and pincodes, delivery charges, minimum order, free-delivery limits and hours.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/delivery-area" },
  openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", title, description, url: "/delivery-area" },
};

type Zone = { name: string; area: string | null; pincode: string | null; delivery_fee: number; min_order_amount: number; free_delivery_threshold: number; eta_min_minutes: number; eta_max_minutes: number; express_supported: boolean };
const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const time12 = (t: string | null | undefined) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${(((h % 24) + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h % 24 < 12 ? "am" : "pm"}`;
};

/**
 * Generated from the same data checkout uses (delivery_zones, settings), so the
 * areas, charges and times shown here can never drift from what customers are actually charged.
 */
export default async function DeliveryAreaPage() {
  const supabase = await createClient();
  const [zonesRes, settings, citiesRes, active] = await Promise.all([
    supabase.from("delivery_zones").select("name, area, pincode, delivery_fee, min_order_amount, free_delivery_threshold, eta_min_minutes, eta_max_minutes, express_supported").eq("is_active", true).order("delivery_fee"),
    getPublicSettings(),
    supabase.from("cities").select("name, is_active, launch_note").eq("is_active", false),
    getActiveCategorySlugs(),
  ]);
  if (zonesRes.error) throw new Error(`delivery zones: ${zonesRes.error.message}`);
  const zones = (zonesRes.data ?? []) as Zone[];
  const hours = (settings.business_hours ?? {}) as { open?: string; close?: string };
  const opens = time12(hours.open); const closes = time12(hours.close);
  const extraKm = num(settings.delivery_fee_per_extra_km, 8); const includedKm = num(settings.delivery_included_km, 3);
  const expressFee = num(settings.express_delivery_fee, 20);
  const expressEta = `${num(settings.express_eta_min_minutes, 12)}–${num(settings.express_eta_max_minutes, 18)} min`;
  const cod = settings.cod_enabled !== false; const online = settings.online_payments_enabled === true;
  const slots = Array.isArray(settings.scheduled_slots) ? (settings.scheduled_slots as string[]) : [];
  const pincodes = [...new Set(zones.map((z) => z.pincode).filter(Boolean))] as string[];
  const upcoming = (citiesRes.data ?? []).map((c) => c.name);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${site.url}/delivery-area#page`, url: `${site.url}/delivery-area`, name: title, description, isPartOf: { "@id": `${site.url}/#website` }, about: { "@id": `${site.url}/#organization` } },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${site.url}/` }, { "@type": "ListItem", position: 2, name: "Delivery area", item: `${site.url}/delivery-area` }] },
    ],
  };

  const cell = "px-3 py-2.5 align-top";
  return (
    <div className="px-4 pb-8 pt-1 sm:px-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <AppBar title="Delivery area & charges" back="/" cart className="-mt-1" />
      <nav aria-label="Breadcrumb" className="mt-2 text-xs text-ink-3 max-lg:hidden"><Link href="/" className="tap hover:text-brand-700">Home</Link> / <span className="text-ink">Delivery area</span></nav>

      <h1 className="mt-1 font-display lg:mt-3 text-2xl font-bold leading-tight text-ink">Delivery area, charges & timings in {site.city}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">
        {site.seoName} delivers groceries, fruits and vegetables to homes in {site.city}, Rajasthan{pincodes.length ? ` (pincode${pincodes.length > 1 ? "s" : ""} ${pincodes.join(", ")})` : ""}. Enter your address or pincode at checkout and we confirm the exact charge before you pay.
      </p>
      <p lang="hi" className="mt-1 text-sm text-ink-3">मेड़ता सिटी में किराना डिलीवरी — आपका पता या पिनकोड डालें, भुगतान से पहले डिलीवरी शुल्क दिख जाएगा।</p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {opens && closes ? <Fact icon={Clock} title="Delivery hours" text={`${opens} – ${closes}, every day`} /> : null}
        <Fact icon={Truck} title="Delivery target" text={`${num(settings.delivery_eta_min_minutes, 20)}–${num(settings.delivery_eta_max_minutes, 25)} min after you order; depends on stock, preparation, distance and riders`} />
        <Fact icon={IndianRupee} title="Charges" text={zones.length ? `${formatINR(Math.min(...zones.map((z) => Number(z.delivery_fee))))} by area; free above ${formatINR(Math.min(...zones.map((z) => Number(z.free_delivery_threshold))))}` : "Shown at checkout"} />
        <Fact icon={Wallet} title="Payment" text={[online ? "UPI, cards and net banking" : null, cod ? "cash on delivery" : null].filter(Boolean).join(" or ") || "Shown at checkout"} />
      </ul>

      <section className="mt-6" aria-labelledby="areas">
        <h2 id="areas" className="font-display text-lg font-bold text-ink">Areas we deliver to</h2>
        {zones.length ? (
          <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-card">
            <table className="w-full min-w-[620px] text-sm">
              <caption className="sr-only">Delivery zones, charges and minimum order</caption>
              <thead className="bg-surface text-left text-xs text-ink-3">
                <tr><th scope="col" className={cell}>Zone</th><th scope="col" className={cell}>Neighbourhoods</th><th scope="col" className={cell}>Pincode</th><th scope="col" className={`${cell} text-right`}>Delivery fee</th><th scope="col" className={`${cell} text-right`}>Free above</th><th scope="col" className={`${cell} text-right`}>Minimum order</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {zones.map((z) => (
                  <tr key={z.name}>
                    <th scope="row" className={`${cell} text-left font-semibold text-ink`}>{z.name}</th>
                    <td className={`${cell} text-ink-2`}>{z.area ?? "—"}</td>
                    <td className={`${cell} tabular text-ink-2`}>{z.pincode ?? "—"}</td>
                    <td className={`${cell} text-right tabular text-ink`}>{formatINR(z.delivery_fee)}</td>
                    <td className={`${cell} text-right tabular text-ink`}>{formatINR(z.free_delivery_threshold)}</td>
                    <td className={`${cell} text-right tabular text-ink`}>{formatINR(z.min_order_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-sm text-ink-3">Delivery areas are being updated. Call us to check your address.</p>}
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Addresses more than {includedKm} km from our pickup point add {formatINR(extraKm)} per extra km to the delivery fee.</li>
          {zones.some((z) => z.express_supported) ? <li>Express delivery ({expressEta}, +{formatINR(expressFee)}) is offered in {zones.filter((z) => z.express_supported).map((z) => z.name).join(", ")}.</li> : null}
          {slots.length ? <li>You can also pick a delivery slot: {slots.join(", ")}.</li> : null}
          {upcoming.length ? <li>Not available yet: {upcoming.join(", ")}.</li> : null}
        </ul>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Shop by category">
        <Link href="/c/grocery" className="rounded-xl border border-line bg-card p-4 text-sm font-semibold text-ink hover:border-brand-300">Grocery & kirana →</Link>
        {active.has("vegetables") ? <Link href="/c/vegetables" className="rounded-xl border border-line bg-card p-4 text-sm font-semibold text-ink hover:border-brand-300">Fresh vegetables →</Link> : null}
        {active.has("fruits") ? <Link href="/c/fruits" className="rounded-xl border border-line bg-card p-4 text-sm font-semibold text-ink hover:border-brand-300">Fresh fruits →</Link> : null}
        {!active.has("vegetables") || !active.has("fruits") ? <Link href="/c/dry-fruits" className="rounded-xl border border-line bg-card p-4 text-sm font-semibold text-ink hover:border-brand-300">Dry fruits →</Link> : null}
      </section>

      <p className="mt-6 text-sm text-ink-2">
        Questions about delivery to your address? Call <a href={`tel:+91${site.supportPhone.replace(/\D/g, "").slice(-10)}`} className="font-semibold text-brand-700 hover:underline">{site.supportPhone}</a> or email <a href={`mailto:${site.supportEmail}`} className="font-semibold text-brand-700 hover:underline">{site.supportEmail}</a>.
      </p>
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
