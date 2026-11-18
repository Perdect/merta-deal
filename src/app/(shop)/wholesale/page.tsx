import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarCheck, ClipboardList, FileQuestion, Home, IndianRupee, PencilLine, Phone, ShoppingBasket, Store, Truck, UtensilsCrossed, Warehouse } from "lucide-react";
import { AppBar } from "@/components/shop/app-bar";
import { WholesaleRange, RangeLegend } from "@/components/wholesale/range";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/states";
import { getWholesaleCatalogue, getMyWholesale } from "@/lib/data/wholesale";
import { getSessionUser } from "@/lib/supabase/server";
import { getPublicSettings } from "@/lib/data/catalog";
import { isQuoteStage, openRequestCount, wholesaleStage, WHOLESALE_ORDER_LABEL, type WholesaleCatalogueItem } from "@/lib/wholesale";
import { site } from "@/config/site";
import { formatINR } from "@/lib/utils";

const title = `Wholesale Grocery in ${site.city}: Full Cases at Wholesale Prices`;
const description = `Buy monthly kirana grocery in full cases at wholesale prices from ${site.seoName} in ${site.city}: for homes, hostels, shops and offices. Pick cases or ask us to price what you need, pay on delivery.`;
export const metadata: Metadata = { title, description, alternates: { canonical: "/wholesale" }, openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", url: "/wholesale", title, description } };
export const dynamic = "force-dynamic";

const tel = `tel:${site.supportPhone.replace(/\s/g, "")}`;

/** Who wholesale is for. Four plain descriptions of the same offer, not four different offers. */
const AUDIENCES = [
  { icon: Home, t: "Households", s: "The month's ration in one go. No shop and no GST number needed." },
  { icon: Store, t: "Kirana shops", s: "Add your shop name and GSTIN once and they print on every bill." },
  { icon: UtensilsCrossed, t: "Hostels & messes", s: "Big tins and full cases for a kitchen that cooks every day." },
  { icon: Warehouse, t: "Offices & canteens", s: "Pantry stock by the case, delivered to the office address." },
];

/** The statuses a customer will actually see, in the order they happen. Labels come from the shared map. */
const JOURNEY = [
  { k: "submitted" as const, s: "You sent it. Nothing is priced, packed or charged yet." },
  { k: "reviewing" as const, s: "We are checking stock and working out the price." },
  { k: "quoted" as const, s: "The price is in front of you. Approve it, or decline — it is your call." },
  { k: "approved" as const, s: "Agreed. We confirm stock and turn it into a real order." },
  { k: "placed" as const, s: "It is a live order now: packed, picked up and delivered like any other." },
];

/** What the range covers, read from the products the owner actually listed — never a claimed list. */
function categoriesOf(items: WholesaleCatalogueItem[]) {
  const map = new Map<string, string[]>();
  for (const i of items) {
    const key = i.category ?? "Other";
    map.set(key, [...(map.get(key) ?? []), i.name]);
  }
  return [...map.entries()].map(([category, names]) => ({ category, names }));
}

export default async function WholesalePage() {
  const user = await getSessionUser();
  const [cat, mine, settings] = await Promise.all([
    getWholesaleCatalogue({ signedIn: Boolean(user) }),
    user ? getMyWholesale() : Promise.resolve(null),
    getPublicSettings(),
  ]);

  const enabled = settings.wholesale_enabled !== false;
  const minOrder = Number(settings.wholesale_min_order_amount ?? 0) || 0;
  const fee = Number(settings.wholesale_delivery_fee ?? 0) || 0;
  // `wholesale_quote_lead_hours` is a public setting inserted by the bulk-order migration, so it says
  // whether quotes exist without asking for a session: a signed-out visitor sees the same offer.
  const quoteHours = Number(settings.wholesale_quote_lead_hours ?? 0) || 0;
  const bulkOrders = quoteHours > 0 && cat.installed;
  const canOrder = enabled && bulkOrders;
  const paused = mine?.shop?.status === "suspended";

  const items = cat.items;
  const priced = items.filter((i) => i.price_per_case != null).length;
  const groups = categoriesOf(items);

  // The customer's own open orders, so the page tells them where they stand instead of asking again.
  const orders = mine?.orders ?? [];
  const awaitingYou = orders.filter((o) => o.status === "quoted");
  const withUs = orders.filter((o) => isQuoteStage(o.status) && o.status !== "quoted");
  const live = orders.filter((o) => o.status === "approved" || o.status === "placed");

  return (
    <div className="px-4 pb-10 pt-1 sm:px-0">
      <AppBar title="Wholesale" back="/" cart className="-mt-1" />

      {/* Where the customer stands, before anything else on the page. */}
      {awaitingYou.length > 0 ? (
        <Alert tone="warning" className="mt-2">
          <strong>Your quote is ready.</strong> We have priced {awaitingYou.length === 1 ? "your bulk order" : `${awaitingYou.length} bulk orders`}. Nothing is packed until you approve it.{" "}
          <Link href="/account/wholesale" className="font-bold underline">Review the quote</Link>
        </Alert>
      ) : withUs.length > 0 ? (
        <Alert tone="info" className="mt-2">
          <strong>Your bulk order is with us.</strong> We are confirming stock and price{openRequestCount(withUs[0]!) > 0 ? ` for ${openRequestCount(withUs[0]!)} item${openRequestCount(withUs[0]!) === 1 ? "" : "s"}` : ""}.{" "}
          <Link href="/account/wholesale" className="font-bold underline">See what was sent</Link>
        </Alert>
      ) : live.length > 0 ? (
        <Alert tone="success" className="mt-2">
          <strong>{wholesaleStage(live[0]!).label}.</strong> Your wholesale order is on its way through.{" "}
          <Link href="/account/wholesale" className="font-bold underline">Track it</Link>
        </Alert>
      ) : null}

      {/* ---------- hero ---------- */}
      <section className="mt-2 overflow-hidden rounded-2xl border border-brand-100 bg-brand-50 p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Wholesale · {site.city}</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight text-ink sm:text-3xl">Buy groceries by the case, at wholesale prices</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          For homes, kirana shops, hostels and offices in {site.city}. Pick full cases from our range, or write in whatever you need and we send you the price first. Pay cash or UPI when it reaches your door.
        </p>
        <p lang="hi" className="mt-1.5 text-sm text-ink-3">पूरे कार्टन, थोक भाव में। घर, दुकान, हॉस्टल या ऑफिस — कोई भी ऑर्डर कर सकता है। जो हमारी लिस्ट में नहीं है, वो भी लिखकर भेजें; हम भाव बताएंगे। पैसा डिलीवरी पर।</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {!enabled ? <p className="text-sm font-semibold text-ink-2">Wholesale ordering is closed right now.</p>
            : paused ? <p className="text-sm font-semibold text-ink-2">Wholesale ordering is paused for your account. {mine?.shop?.review_note ?? "Call us to resume it."}</p>
            : canOrder ? (
              <>
                <Button href="/wholesale/order" size="lg" className="rounded-xl">Create a bulk order <ArrowRight className="h-4 w-4" aria-hidden /></Button>
                <Button href="#range" variant="outline" size="lg" className="rounded-xl">See the range</Button>
              </>
            ) : <Button href="#range" size="lg" className="rounded-xl">See the range</Button>}
          <Button href={tel} variant="outline" size="lg" className="rounded-xl"><Phone className="h-4 w-4" aria-hidden /> {site.supportPhone}</Button>
        </div>
        {canOrder ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-brand-800">
            <span>Pay on delivery</span>
            <span>{minOrder > 0 ? `${formatINR(minOrder)} minimum` : "No minimum order"}</span>
            <span>{fee > 0 ? `Delivery ${formatINR(fee)}` : "No delivery charge"}</span>
            <span>You pick the delivery day</span>
          </p>
        ) : null}
      </section>

      {/* ---------- who it is for ---------- */}
      <section className="mt-6" aria-labelledby="who">
        <h2 id="who" className="font-display text-lg font-bold text-ink">Who can order</h2>
        <p className="mt-1 text-sm text-ink-2">
          Anyone with a {site.seoName} account and a delivery address inside our area. A shop name and GSTIN are optional — add them only if you want them on your bills.
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {AUDIENCES.map((a) => (
            <li key={a.t} className="flex gap-3 rounded-xl border border-line bg-card p-4 shadow-card">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><a.icon className="h-5 w-5" aria-hidden /></span>
              <div><p className="text-sm font-bold text-ink">{a.t}</p><p className="mt-0.5 text-sm text-ink-2">{a.s}</p></div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- what is available ---------- */}
      <section className="mt-6" aria-labelledby="what">
        <h2 id="what" className="font-display text-lg font-bold text-ink">What you can buy in bulk</h2>
        {groups.length === 0 ? (
          <p className="mt-1 text-sm text-ink-2">Nothing is listed for wholesale yet. Write in what you need and we will price it.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-2">
              {items.length} product{items.length === 1 ? "" : "s"} are listed for wholesale today, and we add more as suppliers confirm. Anything not on this list can still be ordered — write it in and we price it.
            </p>
            <ul className="mt-3 space-y-2">
              {groups.map((g) => (
                <li key={g.category} className="rounded-xl border border-line bg-card p-4 shadow-card">
                  <p className="text-sm font-bold text-ink">{g.category}</p>
                  <p className="mt-0.5 text-sm text-ink-2">{g.names.join(" · ")}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ---------- how it works ---------- */}
      <section className="mt-6" aria-labelledby="how">
        <h2 id="how" className="font-display text-lg font-bold text-ink">How to place an order</h2>
        <ol className="mt-3 space-y-3">
          {[
            { icon: ShoppingBasket, t: "Pick full cases", s: "Every card shows the pack, how many are in a case, the minimum you can take, what is in stock and the case price when there is one." },
            { icon: PencilLine, t: "Write in anything we don't list", s: "Product name, brand if it matters, how much and in what unit, pack size, and a photo if that is easier. It goes in the same order as the cases you picked." },
            { icon: CalendarCheck, t: "Choose where and when", s: "A saved address — home, shop, hostel or office — the day you want it (today up to 30 days ahead), who to call, and any delivery instructions." },
            { icon: FileQuestion, t: "We send the price, you approve", s: `Items on quote and anything you wrote in come back priced${quoteHours > 0 ? `, usually within ${quoteHours} hour${quoteHours === 1 ? "" : "s"}` : ""}. Nothing is packed or charged until you approve. If everything you picked already has a wholesale price, there is no quote to wait for — it is confirmed with us straight away.` },
            { icon: Truck, t: "Delivered, pay at the door", s: "Our rider brings it on the day you chose. Pay cash or UPI on delivery and share the OTP as proof." },
          ].map((s, i) => (
            <li key={s.t} className="flex gap-3 rounded-xl border border-line bg-card p-4 shadow-card">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><s.icon className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />{s.t}</p>
                <p className="mt-0.5 text-sm text-ink-2">{s.s}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- what happens after you send it ---------- */}
      <section className="mt-6 rounded-xl border border-line bg-card p-4 shadow-card" aria-labelledby="after">
        <h2 id="after" className="flex items-center gap-2 font-display text-base font-bold text-ink"><ClipboardList className="h-5 w-5 text-brand-700" aria-hidden /> After you send it</h2>
        <p className="mt-1 text-sm text-ink-2">Your order shows one of these under <Link href="/account/wholesale" className="font-semibold text-brand-700 hover:underline">Account → Wholesale</Link>. It is never called confirmed until we have the price and the stock.</p>
        <ol className="mt-3 space-y-2">
          {JOURNEY.map((j, i) => (
            <li key={j.k} className="flex gap-3 text-sm">
              <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />
              <p className="min-w-0"><span className="font-bold text-ink">{i + 1}. {WHOLESALE_ORDER_LABEL[j.k]}</span> <span className="text-ink-2">— {j.s}</span></p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- the range ---------- */}
      <section id="range" className="mt-6 scroll-mt-20" aria-labelledby="range-h">
        <div className="flex items-end justify-between gap-3">
          <h2 id="range-h" className="font-display text-lg font-bold text-ink">The wholesale range</h2>
          {user ? <Link href="/account/wholesale" className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">My orders</Link> : null}
        </div>
        <p className="mt-1 text-sm text-ink-2">
          Prices are per full case, set by {site.seoName} — never the retail price.
          {items.length > 0 ? ` ${priced} of ${items.length} ${priced === 1 ? "has" : "have"} a confirmed case price; the rest we quote before anything is packed.` : ""}
        </p>
        <div className="mt-2"><RangeLegend /></div>
        <div className="mt-3">
          {enabled ? <WholesaleRange items={items} minOrder={minOrder} /> : (
            <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">Wholesale ordering is closed right now. Call {site.supportPhone} and we will take your list.</p>
          )}
        </div>
      </section>

      {/* ---------- request a product ---------- */}
      {canOrder && !paused ? (
        <section className="mt-6 rounded-2xl border border-brand-200 bg-brand-50 p-5" aria-labelledby="request">
          <h2 id="request" className="flex items-center gap-2 font-display text-base font-bold text-ink"><PencilLine className="h-5 w-5 text-brand-700" aria-hidden /> Need something we don&rsquo;t list?</h2>
          <p className="mt-1 text-sm text-ink-2">Write it in and we price it with the supplier. Tell us:</p>
          <ul className="mt-2 grid gap-1.5 text-sm text-ink-2 sm:grid-cols-2">
            {["The product name", "The brand, if it has to be that one", "How much, and in what unit", "Pack or case size you want", "A photo, if that is easier", "Where and when to deliver"].map((f) => (
              <li key={f} className="flex items-start gap-2"><span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />{f}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink-2">
            A written-in item carries <Badge tone="saffron" size="xs">no price</Badge> until we have one from the supplier. We either match it to a product and price it, or tell you plainly that it is not available.
          </p>
          <Button href="/wholesale/order#request" size="lg" className="mt-3 rounded-xl">Request a product <ArrowRight className="h-4 w-4" aria-hidden /></Button>
        </section>
      ) : null}

      {/* ---------- prices, delivery, payment ---------- */}
      <section className="mt-6 rounded-xl border border-line bg-card p-4 shadow-card" aria-labelledby="rules">
        <h2 id="rules" className="flex items-center gap-2 font-display text-base font-bold text-ink"><IndianRupee className="h-5 w-5 text-brand-700" aria-hidden /> Prices, delivery and payment</h2>
        <dl className="mt-3 divide-y divide-line text-sm">
          {[
            { t: "Case size and minimum", d: "Both are shown on every card and set per product. You cannot order part of a case, and the minimum is the fewest cases we will send of that product." },
            { t: "Confirmed price vs quote", d: <>A card marked <Badge tone="success" size="xs" className="gap-1"><BadgeCheck className="h-3 w-3" aria-hidden />Price confirmed</Badge> can be ordered at that case price. A card marked <Badge tone="saffron" size="xs" className="gap-1"><FileQuestion className="h-3 w-3" aria-hidden />Price on quote</Badge> has no wholesale price yet — add it anyway and we send the price for your approval.</> },
            { t: "Availability", d: "Stock in cases is what the shop holds today. We check it again before packing and call you if anything is short; a short item is taken off the bill, never swapped without asking." },
            { t: "Minimum order", d: minOrder > 0 ? `${formatINR(minOrder)} for a wholesale order.` : "None set at the moment, so order as little or as much as you need." },
            { t: "Delivery", d: `${fee > 0 ? `${formatINR(fee)} per wholesale order, plus GST on the charge.` : "No wholesale delivery charge is set at the moment."} You choose the day, from today up to 30 days ahead; a wholesale order is not a 30-minute delivery. Any charge is on the quote before you approve it.` },
            { t: "Payment", d: "Cash or UPI when the order reaches you. Nothing is charged online, and credit terms are not offered here." },
            { t: "Bills and GST", d: <>Add your shop name and GSTIN under <Link href="/wholesale/register" className="font-semibold text-brand-700 hover:underline">wholesale details</Link> and they appear on your bills. Households can skip it.</> },
          ].map((r) => (
            <div key={r.t} className="py-2.5 first:pt-0 last:pb-0 sm:flex sm:gap-4">
              <dt className="font-bold text-ink sm:w-52 sm:shrink-0">{r.t}</dt>
              <dd className="text-ink-2 sm:flex-1">{r.d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-6 text-center text-sm text-ink-2">
        Easier on the phone? Call <a href={tel} className="font-semibold text-brand-700 hover:underline">{site.supportPhone}</a> and we will take your list.
      </p>
    </div>
  );
}
