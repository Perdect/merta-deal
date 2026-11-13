import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBasket, ClipboardList, CalendarCheck, Truck, ShieldCheck } from "lucide-react";
import { AppBar } from "@/components/shop/app-bar";
import { CatalogueGrid } from "@/components/wholesale/catalogue-grid";
import { BulkOrderCta } from "@/components/wholesale/bulk-order-builder";
import { Button } from "@/components/ui/button";
import { getWholesaleCatalogue, getMyWholesale } from "@/lib/data/wholesale";
import { getSessionUser } from "@/lib/supabase/server";
import { getPublicSettings } from "@/lib/data/catalog";
import { etaText } from "@/lib/eta";
import { site } from "@/config/site";
import { formatINR } from "@/lib/utils";

const title = `Wholesale Grocery in ${site.city}: Full Cases at Wholesale Prices`;
const description = `Buy monthly kirana grocery in full cases at wholesale prices from ${site.seoName} in ${site.city}: for homes, hostels, shops and offices. Order now or set a monthly list, pay on delivery.`;
export const metadata: Metadata = { title, description, alternates: { canonical: "/wholesale" }, openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", url: "/wholesale", title, description } };
export const dynamic = "force-dynamic";

export default async function WholesalePage() {
  const user = await getSessionUser();
  const [cat, mine, settings] = await Promise.all([getWholesaleCatalogue({ signedIn: Boolean(user) }), user ? getMyWholesale() : Promise.resolve(null), getPublicSettings()]);
  const enabled = settings.wholesale_enabled !== false;
  const minOrder = Number(settings.wholesale_min_order_amount ?? 0) || 0;
  const fee = Number(settings.wholesale_delivery_fee ?? 0) || 0;
  const eta = etaText(Number(settings.delivery_eta_min_minutes), Number(settings.delivery_eta_max_minutes)) ?? "minutes";
  const hasOrders = Boolean(mine?.shop && ((mine.orders?.length ?? 0) > 0 || mine.list));
  // Bulk orders with quotes arrive with migration 0053; until then only the catalogue flow is offered.
  const bulkOrders = mine?.settings?.max_request_lines != null;
  const steps = [
    { icon: ShoppingBasket, t: bulkOrders ? "Pick full cases, or write it in" : "Pick full cases", s: `Every product shows the case size, the minimum and the wholesale price per case.${bulkOrders ? " Anything we don't list, write in and we price it." : " Add what you need."}` },
    { icon: CalendarCheck, t: "Order now, or every month", s: `Order today with your mobile number and OTP, or save a monthly list and we ask you to review it ${Number(settings.wholesale_review_lead_days ?? 2) || 2} days before each restock day.` },
    { icon: ClipboardList, t: "We confirm, you approve", s: "We check the stock and place the order. Nothing is placed or charged without your approval." },
    { icon: Truck, t: "Delivered, pay on delivery", s: "Our rider brings it to your home or shop on the day you chose. Pay cash or UPI at the door, with the OTP as proof." },
  ];
  return (
    <div className="px-4 pb-28 pt-1 sm:px-0">
      <AppBar title="Wholesale" back="/" cart className="-mt-1" />
      <section className="mt-2 rounded-2xl border border-brand-100 bg-brand-50 p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Wholesale · {site.city}</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight text-ink sm:text-3xl">Monthly kirana grocery at wholesale prices</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">Buy full cases of atta, oil, tea, spices and more for your home, hostel, shop or office. Anyone can order: pick the cases, choose a day, pay on delivery.</p>
        <p lang="hi" className="mt-1.5 text-sm text-ink-3">पूरे कार्टन, थोक भाव में। घर हो या दुकान, कोई भी ऑर्डर कर सकता है। पैसा डिलीवरी पर।</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {!enabled ? <p className="text-sm font-semibold text-ink-2">Wholesale ordering is closed right now.</p>
            : bulkOrders ? <><Button href="/wholesale/order" size="lg" className="rounded-xl">Create a bulk order</Button><Button href="#range" variant="outline" size="lg" className="rounded-xl">Browse the range</Button></>
            : <Button href="#range" size="lg" className="rounded-xl">Shop wholesale</Button>}
          {hasOrders ? <Button href="/account/wholesale" variant="outline" size="lg" className="rounded-xl">My wholesale orders</Button> : null}
          <Button href={`tel:${site.supportPhone.replace(/\s/g, "")}`} variant="outline" size="lg" className="rounded-xl">Call {site.supportPhone}</Button>
        </div>
      </section>

      {enabled && bulkOrders ? <BulkOrderCta className="mt-4" /> : null}

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

      <section id="range" className="mt-6 scroll-mt-24" aria-labelledby="range-h">
        <div className="flex items-end justify-between gap-3">
          <h2 id="range-h" className="font-display text-lg font-bold text-ink">Wholesale range</h2>
          {user ? <Link href="/account/wholesale" className="text-sm font-semibold text-brand-700">Monthly list &amp; orders</Link> : null}
        </div>
        <p className="mt-1 text-sm text-ink-3">Prices are per full case. A product on quote has no wholesale price yet; add it to a bulk order and we send you the price before anything is packed. We add products as suppliers confirm.</p>
        <div className="mt-3">{enabled ? <CatalogueGrid items={cat.items} signedIn={Boolean(user)} eta={eta} minOrder={minOrder} deliveryFee={fee} /> : null}</div>
      </section>

      <section className="mt-6 rounded-lg border border-line bg-card p-4 shadow-card" aria-labelledby="terms">
        <h2 id="terms" className="flex items-center gap-2 font-display text-base font-bold text-ink"><ShieldCheck className="h-5 w-5 text-brand-700" aria-hidden /> Plain terms</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Wholesale prices are set per product by {site.seoName} and are never the retail price. A product marked <strong>Price on quote</strong> has no wholesale price yet; we confirm it with you before it can be ordered.</li>
          <li>Case sizes and minimum quantities are shown on every product. Stock is confirmed when we place the order; we call if anything is short.</li>
          {minOrder > 0 ? <li>Minimum wholesale order: {formatINR(minOrder)}.</li> : null}
          <li>Delivery charge: {fee > 0 ? formatINR(fee) + " per order" : "none set at the moment"}; GST applies to the charge.</li>
          <li>Nothing is charged online. Payment on delivery (cash or UPI). Credit terms are not offered online.</li>
          <li>Run a shop? Add your shop name and GSTIN under <Link href="/wholesale/register" className="font-semibold text-brand-700">wholesale details</Link> so they appear on your bills. It is optional.</li>
        </ul>
      </section>
    </div>
  );
}
