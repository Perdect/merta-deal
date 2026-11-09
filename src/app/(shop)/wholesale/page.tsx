import type { Metadata } from "next";
import Link from "next/link";
import { Store, ClipboardList, CalendarCheck, Truck, ShieldCheck } from "lucide-react";
import { AppBar } from "@/components/shop/app-bar";
import { CatalogueGrid } from "@/components/wholesale/catalogue-grid";
import { Button } from "@/components/ui/button";
import { getWholesaleCatalogue, getMyShop } from "@/lib/data/wholesale";
import { getSessionUser } from "@/lib/supabase/server";
import { getPublicSettings } from "@/lib/data/catalog";
import { site } from "@/config/site";
import { formatINR } from "@/lib/utils";

const title = `Wholesale Grocery Supply for Kirana Shops in ${site.city}`;
const description = `${site.seoName} supplies kirana shops in ${site.city} with monthly wholesale packs and cases: register your shop, keep a restock list, review and approve each order before it is placed, pay on delivery.`;
export const metadata: Metadata = { title, description, alternates: { canonical: "/wholesale" }, openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", url: "/wholesale", title, description } };
export const dynamic = "force-dynamic";

export default async function WholesalePage() {
  const user = await getSessionUser();
  const [cat, mine, settings] = await Promise.all([getWholesaleCatalogue({ signedIn: Boolean(user) }), user ? getMyShop() : Promise.resolve(null), getPublicSettings()]);
  const enabled = settings.wholesale_enabled !== false;
  const minOrder = Number(settings.wholesale_min_order_amount ?? 0) || 0;
  const shop = mine?.shop ?? null;
  const steps = [
    { icon: Store, t: "Register your shop", s: "Shop name, owner, mobile and the delivery address. We call to verify and approve it." },
    { icon: ClipboardList, t: "Keep a monthly restock list", s: "Pick wholesale packs and cases and the day of the month you want them." },
    { icon: CalendarCheck, t: "Review before anything is placed", s: `${Number(settings.wholesale_review_lead_days ?? 2) || 2} days before, you get the order to check. Change quantities, approve, or skip the month. Nothing is ordered until you approve.` },
    { icon: Truck, t: "Delivered to the shop, pay on delivery", s: "Our rider delivers on your restock day and you pay cash or UPI at the door, with the OTP as proof." },
  ];
  return (
    <div className="px-4 pb-10 pt-1 sm:px-0">
      <AppBar title="For kirana shops" back="/" cart className="-mt-1" />
      <section className="mt-2 rounded-2xl border border-brand-100 bg-brand-50 p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Wholesale · {site.city}</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight text-ink sm:text-3xl">Monthly wholesale supply for your kirana shop</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">Order packs and cases of fast-moving grocery every month from {site.seoName}. You set the list and the date; we show you each order before it is placed; you pay on delivery.</p>
        <p lang="hi" className="mt-1.5 text-sm text-ink-3">अपनी दुकान के लिए हर महीने थोक सामान। ऑर्डर आप देखकर ही मंज़ूर करते हैं, पैसा डिलीवरी पर।</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {!enabled ? <p className="text-sm font-semibold text-ink-2">Registration is closed right now.</p>
            : shop ? <Button href="/account/shop" size="lg" className="rounded-xl">Open my shop</Button>
            : <Button href="/wholesale/register" size="lg" className="rounded-xl">Register your shop</Button>}
          <Button href={`tel:${site.supportPhone.replace(/\s/g, "")}`} variant="outline" size="lg" className="rounded-xl">Call {site.supportPhone}</Button>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="how">
        <h2 id="how" className="font-display text-lg font-bold text-ink">How it works</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2">
          {steps.map((s, i) => (
            <li key={s.t} className="flex gap-3 rounded-lg border border-line bg-card p-4 shadow-card">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><s.icon className="h-5 w-5" aria-hidden /></span>
              <div><p className="text-sm font-bold text-ink">{i + 1}. {s.t}</p><p className="mt-0.5 text-sm text-ink-2">{s.s}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6 rounded-lg border border-line bg-card p-4 shadow-card" aria-labelledby="terms">
        <h2 id="terms" className="flex items-center gap-2 font-display text-base font-bold text-ink"><ShieldCheck className="h-5 w-5 text-brand-700" aria-hidden /> Plain terms</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Wholesale prices are set per product by {site.seoName}. A product marked <strong>Price on quote</strong> has no wholesale price yet; we confirm it with you before it can be ordered. Retail prices are never passed off as wholesale.</li>
          <li>Case sizes and minimum quantities are shown on every product.</li>
          {minOrder > 0 ? <li>Minimum wholesale order: {formatINR(minOrder)}.</li> : null}
          <li>Delivery charge: {Number(settings.wholesale_delivery_fee ?? 0) > 0 ? formatINR(Number(settings.wholesale_delivery_fee)) + " per order" : "none set at the moment"}; GST applies to the charge.</li>
          <li>No order is placed and nothing is charged without your approval. You can skip any month.</li>
          <li>Payment on delivery (cash or UPI). Credit terms are not offered online.</li>
        </ul>
      </section>

      <section className="mt-6" aria-labelledby="range">
        <div className="flex items-end justify-between gap-3">
          <h2 id="range" className="font-display text-lg font-bold text-ink">Wholesale range</h2>
          {!user ? <Link href="/wholesale/register" className="text-sm font-semibold text-brand-700">Register to see prices</Link> : null}
        </div>
        <p className="mt-1 text-sm text-ink-3">Grown from what {site.city} shops ask for. Tell us what you need monthly when you register; we add products as suppliers confirm.</p>
        <div className="mt-3"><CatalogueGrid items={cat.items} showPrices={Boolean(shop && shop.status === "approved")} /></div>
      </section>
    </div>
  );
}
