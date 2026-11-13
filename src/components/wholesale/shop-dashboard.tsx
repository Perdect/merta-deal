"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, ClipboardList, PackageCheck, Pause, Play, Plus, ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { QuantityStepper } from "@/components/ui/misc";
import { ProductImage } from "@/components/shop/product-image";
import { toast } from "@/components/ui/toast";
import { pauseWholesaleListAction, proposeWholesaleOrderAction, reviewWholesaleOrderAction, saveWholesaleListAction } from "@/lib/actions/wholesale";
import { formatINR, formatDateTime, cn } from "@/lib/utils";
import { QuoteReview, PendingRequestCard } from "./quote-review";
import { buyerLabel, ordinal, restockDateLabel, isQuoteStage, wholesaleStage, BUYER_STATUS_LABEL, type MyWholesale, type WholesaleCatalogueItem, type WholesaleOrder } from "@/lib/wholesale";

type Line = { product_id: string; cases: number };
const byId = (items: WholesaleCatalogueItem[]) => Object.fromEntries(items.map((i) => [i.product_id, i]));

/** The customer's wholesale page: delivery details, the order waiting for review, the optional monthly list, and past orders. */
export function ShopDashboard({ data, catalogue }: { data: MyWholesale; catalogue: WholesaleCatalogueItem[] }) {
  const buyer = data.shop;
  const paused = buyer?.status === "suspended";
  const proposed = (data.orders ?? []).find((o) => o.status === "proposed") ?? null;
  const quoted = (data.orders ?? []).filter((o) => o.status === "quoted");
  const waiting = (data.orders ?? []).filter((o) => o.status === "submitted" || o.status === "reviewing");
  return (
    <div className="space-y-5">
      <section className={cn("rounded-2xl border p-4", paused ? "border-line bg-card" : "border-brand-100 bg-brand-50")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-3">{buyer ? BUYER_STATUS_LABEL[buyer.status] : "Wholesale"}</p>
            <h2 className="mt-0.5 font-display text-xl font-bold text-ink">{buyer ? buyerLabel(buyer) : "Full cases at wholesale prices"}</h2>
            {buyer ? <p className="text-sm text-ink-2">{buyer.shop_name ? `${buyer.owner_name} · ` : ""}+91 {buyer.phone}{buyer.gstin ? ` · GSTIN ${buyer.gstin}` : ""}</p> : <p className="text-sm text-ink-2">Order now from the wholesale range, or keep a monthly list below.</p>}
          </div>
          <Button href="/wholesale/order" size="sm" className="shrink-0 rounded-lg"><ShoppingBasket className="h-4 w-4" /> New bulk order</Button>
        </div>
        {buyer ? (buyer.address ? <p className="mt-2 text-sm text-ink-2">Delivers to {[buyer.address.house, buyer.address.street, buyer.address.area, `${buyer.address.city} – ${buyer.address.pincode}`].filter(Boolean).join(", ")}</p>
          : <p className="mt-2 text-sm text-danger">No delivery address on file. <Link href="/wholesale/register" className="font-semibold underline">Add one</Link>.</p>) : null}
        {paused ? <p className="mt-2 text-sm text-ink-2">{buyer?.review_note ?? "Wholesale ordering is paused for your account."} Call us to resume.</p> : null}
        <p className="mt-2 text-xs text-ink-3"><Link href="/wholesale/register" className="font-semibold text-brand-700">{buyer?.shop_name || buyer?.gstin ? "Edit shop details" : "Run a shop? Add its name and GSTIN for your bills"}</Link></p>
      </section>

      {!paused ? quoted.map((o) => <QuoteReview key={o.id} order={o} settings={data.settings} />) : null}
      {!paused ? waiting.map((o) => <PendingRequestCard key={o.id} order={o} quoteHours={data.settings?.quote_lead_hours ?? 24} />) : null}
      {!paused && proposed ? <ProposalReview order={proposed} catalogue={catalogue} settings={data.settings} /> : null}
      {!paused ? <ListEditor list={data.list ?? null} catalogue={catalogue} hasProposal={Boolean(proposed)} leadDays={data.settings?.lead_days ?? 2} /> : null}
      <OrderHistory orders={(data.orders ?? []).filter((o) => o.status !== "proposed" && !isQuoteStage(o.status))} />
    </div>
  );
}

function ListEditor({ list, catalogue, hasProposal, leadDays }: { list: MyWholesale["list"] | null; catalogue: WholesaleCatalogueItem[]; hasProposal: boolean; leadDays: number }) {
  const router = useRouter();
  const cat = byId(catalogue);
  const [day, setDay] = React.useState<number>(list?.restock_day ?? 1);
  const [lines, setLines] = React.useState<Line[]>(list?.items.map((i) => ({ product_id: i.product_id, cases: i.cases })) ?? []);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState<"save" | "propose" | "pause" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const dirty = JSON.stringify({ day, lines }) !== JSON.stringify({ day: list?.restock_day ?? 1, lines: list?.items.map((i) => ({ product_id: i.product_id, cases: i.cases })) ?? [] });
  const set = (id: string, cases: number) => setLines((ls) => cases <= 0 ? ls.filter((l) => l.product_id !== id) : ls.some((l) => l.product_id === id) ? ls.map((l) => (l.product_id === id ? { ...l, cases } : l)) : [...ls, { product_id: id, cases }]);
  const subtotal = lines.reduce((a, l) => a + (cat[l.product_id]?.price_per_case ?? 0) * l.cases, 0);
  const unpriced = lines.filter((l) => cat[l.product_id]?.quote_required);
  const save = async () => {
    setBusy("save"); setError(null);
    const r = await saveWholesaleListAction(day, lines);
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    toast.success("Monthly list saved", `Next restock: ${restockDateLabel(r.data.next_run_date)}. We will ask you to review it ${leadDays} day${leadDays === 1 ? "" : "s"} before.`);
    router.refresh();
  };
  const propose = async () => {
    setBusy("propose"); const r = await proposeWholesaleOrderAction(); setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    router.refresh();
  };
  const pause = async () => {
    if (!list) return; setBusy("pause"); const r = await pauseWholesaleListAction(!list.is_active); setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(list.is_active ? "Monthly orders paused" : "Monthly orders resumed"); router.refresh();
  };
  const available = catalogue.filter((c) => c.is_available && !lines.some((l) => l.product_id === c.product_id));
  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink"><ClipboardList className="h-5 w-5 text-brand-700" aria-hidden /> Monthly list (optional)</h2>
          <p className="mt-0.5 text-xs text-ink-3">{list ? <>Next restock <strong>{restockDateLabel(list.next_run_date)}</strong>{list.is_active ? "" : " · paused"}</> : "Same cases every month? Pick them and the day you want them. You review each order before it is placed."}</p>
        </div>
        {list ? <Button size="sm" variant="ghost" onClick={pause} loading={busy === "pause"}>{list.is_active ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Resume</>}</Button> : null}
      </div>

      <label className="mt-4 block text-sm font-semibold text-ink">Restock day of the month
        <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="mt-1 block h-11 w-full rounded-md border border-line bg-card px-3 text-sm text-ink sm:w-56">
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ordinal(d)} of every month</option>)}
        </select>
      </label>

      <ul className="mt-4 divide-y divide-line">
        {lines.map((l) => { const p = cat[l.product_id]; if (!p) return null; return (
          <li key={l.product_id} className="flex items-center gap-3 py-3">
            <ProductImage image={p.image_url} brand={p.brand_name} productName={p.name} packSize={p.pack_label} className="h-14 w-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold text-ink">{p.name}</p>
              <p className="text-xs text-ink-3">Case of {p.case_size}{p.pack_label ? ` × ${p.pack_label}` : ""} · min {p.moq_cases}{p.max_cases ? ` · max ${p.max_cases}` : ""}</p>
              <p className="text-xs">{p.quote_required ? <span className="font-semibold text-saffron-700">Price on quote</span> : <span className="text-ink-2">{formatINR(p.price_per_case ?? 0)} / case</span>}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <QuantityStepper value={l.cases} onChange={(v) => set(l.product_id, v < p.moq_cases && v < l.cases ? 0 : Math.max(v, p.moq_cases))} min={0} max={p.max_cases ?? 99} size="sm" />
              <span className="text-[11px] text-ink-3">{l.cases} case{l.cases === 1 ? "" : "s"} · {l.cases * p.case_size} units</span>
            </div>
          </li>); })}
        {lines.length === 0 ? <li className="py-6 text-center text-sm text-ink-3">Nothing on the list yet.</li> : null}
      </ul>

      {adding ? (
        <div className="mt-3 rounded-xl border border-line bg-surface p-3">
          <p className="text-sm font-semibold text-ink">Add from the wholesale range</p>
          {available.length === 0 ? <p className="mt-1 text-sm text-ink-3">Everything available is already on your list.</p> : (
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {available.map((p) => (
                <li key={p.product_id}><button type="button" onClick={() => { set(p.product_id, p.moq_cases); setAdding(false); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-card">
                  <ProductImage image={p.image_url} brand={p.brand_name} productName={p.name} packSize={p.pack_label} className="h-10 w-10 shrink-0" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{p.name}</span><span className="block text-xs text-ink-3">case of {p.case_size} · {p.quote_required ? "price on quote" : `${formatINR(p.price_per_case ?? 0)} / case`}</span></span>
                  <Plus className="h-4 w-4 text-brand-700" aria-hidden />
                </button></li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setAdding(false)} className="mt-2 text-xs font-semibold text-ink-3">Close</button>
        </div>
      ) : <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add product</Button>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
        <p className="text-ink-2">{lines.length} product{lines.length === 1 ? "" : "s"} · priced items {formatINR(subtotal)}{unpriced.length ? <span className="text-saffron-700"> · {unpriced.length} on quote</span> : null}</p>
        <div className="flex gap-2">
          {list && !dirty && !hasProposal && list.is_active ? <Button variant="outline" size="sm" onClick={propose} loading={busy === "propose"}><CalendarClock className="h-4 w-4" /> Review next order now</Button> : null}
          <Button size="sm" onClick={save} loading={busy === "save"} disabled={!dirty || lines.length === 0}>Save list</Button>
        </div>
      </div>
      {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      {unpriced.length ? <p className="mt-2 text-xs text-ink-3">Items on quote stay on your list, but an order can only be approved once we have confirmed their wholesale price with you.</p> : null}
    </section>
  );
}

function ProposalReview({ order, catalogue, settings }: { order: WholesaleOrder; catalogue: WholesaleCatalogueItem[]; settings: MyWholesale["settings"] }) {
  const router = useRouter();
  const cat = byId(catalogue);
  const [lines, setLines] = React.useState<Line[]>(order.items.map((i) => ({ product_id: i.product_id, cases: i.cases })));
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<"approve" | "skip" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const priceOf = (id: string) => cat[id]?.price_per_case ?? order.items.find((i) => i.product_id === id)?.price_per_case ?? null;
  const subtotal = lines.reduce((a, l) => a + (priceOf(l.product_id) ?? 0) * l.cases, 0);
  const unpriced = lines.filter((l) => priceOf(l.product_id) == null);
  const fee = settings?.delivery_fee ?? order.delivery_fee;
  const minOrder = settings?.min_order_amount ?? 0;
  const act = async (action: "approve" | "skip") => {
    setBusy(action); setError(null);
    const r = await reviewWholesaleOrderAction(order.id, action, action === "approve" ? lines : null, note);
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    toast.success(action === "approve" ? "Order approved" : "This month skipped", action === "approve" ? "We will confirm it and deliver on your restock day. Pay on delivery." : "Your list stays as it is for next month.");
    router.refresh();
  };
  return (
    <section className="rounded-2xl border-2 border-saffron-300 bg-card p-4 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wide text-saffron-700">Review your order</p>
      <h2 className="mt-0.5 font-display text-lg font-bold text-ink">Restock for {restockDateLabel(order.restock_date)}</h2>
      <p className="text-sm text-ink-2">Check the quantities, then approve or skip this month. Nothing is placed until you approve.</p>
      <ul className="mt-3 divide-y divide-line">
        {order.items.map((i) => { const l = lines.find((x) => x.product_id === i.product_id); const cases = l?.cases ?? 0; const p = cat[i.product_id]; const price = priceOf(i.product_id); return (
          <li key={i.product_id} className={cn("flex items-center gap-3 py-3", cases === 0 && "opacity-60")}>
            <ProductImage image={i.image_url} brand={null} productName={i.name} packSize={i.pack_label} className="h-12 w-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold text-ink">{i.name}</p>
              <p className="text-xs text-ink-3">case of {i.case_size} · {price == null ? <span className="font-semibold text-saffron-700">price on quote</span> : `${formatINR(price)} / case`}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <QuantityStepper value={cases} onChange={(v) => setLines((ls) => ls.map((x) => (x.product_id === i.product_id ? { ...x, cases: v < (p?.moq_cases ?? 1) && v < x.cases ? 0 : Math.max(v, p?.moq_cases ?? 1) } : x)))} min={0} max={p?.max_cases ?? 99} size="sm" />
              <span className="text-[11px] text-ink-3">{price == null || cases === 0 ? (cases === 0 ? "removed" : "—") : formatINR(price * cases)}</span>
            </div>
          </li>); })}
      </ul>
      <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
        <div className="flex justify-between"><dt className="text-ink-2">Items</dt><dd className="font-semibold text-ink">{formatINR(subtotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-2">Delivery</dt><dd className="font-semibold text-ink">{fee > 0 ? `${formatINR(fee)} + GST` : "No charge set"}</dd></div>
        <div className="flex justify-between text-xs"><dt className="text-ink-3">Payment</dt><dd className="text-ink-3">Cash or UPI on delivery</dd></div>
      </dl>
      {unpriced.length ? <Alert tone="warning" className="mt-3">{unpriced.length} item{unpriced.length === 1 ? " is" : "s are"} still on quote. Remove {unpriced.length === 1 ? "it" : "them"} to approve now, or wait until we confirm the price.</Alert> : null}
      {minOrder > 0 && subtotal < minOrder ? <Alert tone="warning" className="mt-3">Minimum wholesale order is {formatINR(minOrder)}.</Alert> : null}
      <Textarea label="Note for us (optional)" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="e.g. Deliver after 11 am" className="mt-3" />
      {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      <div className="mt-3 flex gap-2">
        <Button size="lg" className="flex-1 rounded-xl" onClick={() => act("approve")} loading={busy === "approve"} disabled={unpriced.length > 0 || lines.every((l) => l.cases === 0) || (minOrder > 0 && subtotal < minOrder)}><PackageCheck className="h-4 w-4" /> Approve order</Button>
        <Button size="lg" variant="outline" className="rounded-xl" onClick={() => act("skip")} loading={busy === "skip"}>Skip this month</Button>
      </div>
    </section>
  );
}

function OrderHistory({ orders }: { orders: WholesaleOrder[] }) {
  if (orders.length === 0) return null;
  return (
    <section>
      <h2 className="font-display text-base font-bold text-ink">Wholesale orders</h2>
      <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-card shadow-card">
        {orders.map((o) => (
          <li key={o.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{o.list_id ? "Restock" : "Delivery"} {restockDateLabel(o.restock_date)}{o.order_number ? ` · ${o.order_number}` : ""}</p>
              <p className="text-xs text-ink-3">{wholesaleStage(o).label} · {o.items.length} product{o.items.length === 1 ? "" : "s"} · {formatINR(o.subtotal)}{o.placed_at ? ` · ${formatDateTime(o.placed_at)}` : ""}</p>
              {o.admin_note ? <p className="text-xs text-ink-2">{o.admin_note}</p> : null}
            </div>
            {o.order_id ? <Link href={`/orders/${o.order_id}`} className="text-sm font-semibold text-brand-700">Track</Link> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
