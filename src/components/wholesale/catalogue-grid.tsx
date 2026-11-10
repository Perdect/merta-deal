"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, ShoppingBasket } from "lucide-react";
import { ProductImage } from "@/components/shop/product-image";
import { QuantityStepper } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/overlay";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { LoginModal } from "@/components/auth/login-modal";
import { orderWholesaleNowAction } from "@/lib/actions/wholesale";
import { formatINR, cn } from "@/lib/utils";
import { dateKey, type WholesaleCatalogueItem } from "@/lib/wholesale";

type Line = { product_id: string; cases: number };

/**
 * The wholesale range as cards anyone can order from: case size, minimum, stock in cases and the case price.
 * Picking cases shows a sticky bar; "Order now" creates an approved wholesale order (an admin confirms and
 * places it, pay on delivery). Signed-out visitors can pick cases too and are asked to log in to order.
 */
export function CatalogueGrid({ items, signedIn, eta, minOrder, deliveryFee }: { items: WholesaleCatalogueItem[]; signedIn: boolean; eta: string; minOrder: number; deliveryFee: number }) {
  const router = useRouter();
  const [lines, setLines] = React.useState<Line[]>([]);
  const [sheet, setSheet] = React.useState(false);
  const [login, setLogin] = React.useState(false);
  const byId = React.useMemo(() => Object.fromEntries(items.map((i) => [i.product_id, i])), [items]);
  const casesOf = (id: string) => lines.find((l) => l.product_id === id)?.cases ?? 0;
  const set = (p: WholesaleCatalogueItem, v: number) => {
    const cur = casesOf(p.product_id);
    const next = v <= 0 || (v < p.moq_cases && v < cur) ? 0 : Math.max(v, p.moq_cases);
    setLines((ls) => next === 0 ? ls.filter((l) => l.product_id !== p.product_id) : ls.some((l) => l.product_id === p.product_id) ? ls.map((l) => (l.product_id === p.product_id ? { ...l, cases: next } : l)) : [...ls, { product_id: p.product_id, cases: next }]);
  };
  const subtotal = lines.reduce((a, l) => a + (byId[l.product_id]?.price_per_case ?? 0) * l.cases, 0);
  const totalCases = lines.reduce((a, l) => a + l.cases, 0);
  const unpriced = lines.filter((l) => byId[l.product_id]?.quote_required);

  if (items.length === 0) return <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">The wholesale range is being set up. Call us with what you need every month and we will add it.</p>;
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p) => {
          const cases = casesOf(p.product_id);
          const orderable = p.is_available && !p.quote_required && p.in_stock_cases >= p.moq_cases;
          return (
            <li key={p.product_id} className={cn("flex flex-col rounded-lg border bg-card p-3 shadow-card", cases > 0 ? "border-brand-600" : "border-line", p.is_available ? "" : "opacity-70")}>
              <ProductImage image={p.image_url} brand={p.brand_name} productName={p.name} packSize={p.pack_label} className="aspect-square w-full" />
              <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink">{p.name}</p>
              <p className="text-xs text-ink-3">{p.pack_label ? `${p.pack_label} · ` : ""}case of {p.case_size}</p>
              <p className="mt-1 text-xs text-ink-3">Min {p.moq_cases} case{p.moq_cases === 1 ? "" : "s"}{p.max_cases ? ` · max ${p.max_cases}` : ""}</p>
              <div className="mt-auto pt-2">
                {p.quote_required ? <p className="text-sm font-semibold text-saffron-700">Price on quote</p>
                  : <p className="text-sm font-bold text-ink">{formatINR(p.price_per_case ?? 0)} <span className="text-xs font-normal text-ink-3">/ case · {formatINR(p.unit_price ?? 0)} each</span></p>}
                {p.retail_price != null && p.unit_price != null && p.retail_price > p.unit_price ? <p className="text-[11px] text-success">Retail {formatINR(p.retail_price)} each · save {Math.round((1 - p.unit_price / p.retail_price) * 100)}%</p> : null}
                <p className={cn("mt-0.5 text-[11px]", p.is_available ? "text-ink-3" : "font-semibold text-danger")}>{!p.is_available ? "Not available right now" : p.in_stock_cases > 0 ? `${p.in_stock_cases} case${p.in_stock_cases === 1 ? "" : "s"} in stock` : "Out of stock · ask us"}</p>
                <div className="mt-2">
                  {orderable ? (
                    cases > 0 ? <QuantityStepper value={cases} onChange={(v) => set(p, v)} min={0} max={Math.min(p.max_cases ?? 99, p.in_stock_cases)} size="sm" className="w-full" />
                      : <Button size="sm" variant="outline" fullWidth className="rounded-lg" onClick={() => set(p, p.moq_cases)}>Add {p.moq_cases} case{p.moq_cases === 1 ? "" : "s"}</Button>
                  ) : p.quote_required ? <Button size="sm" variant="ghost" fullWidth className="rounded-lg" href="tel:+918875020202">Call for a quote</Button> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur sm:px-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">{totalCases} case{totalCases === 1 ? "" : "s"} · {formatINR(subtotal)}</p>
              <p className="truncate text-xs text-ink-3">{lines.length} product{lines.length === 1 ? "" : "s"} · pay on delivery{deliveryFee > 0 ? ` · delivery ${formatINR(deliveryFee)} + GST` : ""}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLines([])}>Clear</Button>
            <Button size="lg" className="rounded-xl" onClick={() => (signedIn ? setSheet(true) : setLogin(true))}><ShoppingBasket className="h-4 w-4" /> {signedIn ? "Order now" : "Login to order"}</Button>
          </div>
        </div>
      ) : null}

      {sheet ? <OrderSheet lines={lines} byId={byId} subtotal={subtotal} unpriced={unpriced.length} minOrder={minOrder} deliveryFee={deliveryFee} onClose={() => setSheet(false)}
        onDone={() => { setSheet(false); setLines([]); router.push("/account/wholesale"); }} /> : null}
      <LoginModal open={login} onClose={() => setLogin(false)} eta={eta} title="Login to order wholesale" />
    </>
  );
}

function OrderSheet({ lines, byId, subtotal, unpriced, minOrder, deliveryFee, onClose, onDone }: { lines: Line[]; byId: Record<string, WholesaleCatalogueItem>; subtotal: number; unpriced: number; minOrder: number; deliveryFee: number; onClose: () => void; onDone: () => void }) {
  const [today] = React.useState(() => new Date());
  const options = React.useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; }), [today]);
  const [date, setDate] = React.useState(() => dateKey(options[1] ?? today));
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const belowMin = minOrder > 0 && subtotal < minOrder;
  const submit = async () => {
    setBusy(true); setError(null);
    const r = await orderWholesaleNowAction(lines, note, date);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast.success("Wholesale order received", "We confirm the stock and place it; you pay on delivery.");
    onDone();
  };
  return (
    <BottomSheet open onClose={onClose} title="Order wholesale" description="We confirm the stock and place it, then deliver on the day you pick. Pay cash or UPI on delivery.">
      <ul className="divide-y divide-line">
        {lines.map((l) => { const p = byId[l.product_id]; if (!p) return null; return (
          <li key={l.product_id} className="flex items-center gap-3 py-2.5 text-sm">
            <ProductImage image={p.image_url} brand={p.brand_name} productName={p.name} packSize={p.pack_label} className="h-11 w-11 shrink-0" />
            <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{p.name}</p><p className="text-xs text-ink-3">{l.cases} × case of {p.case_size} = {l.cases * p.case_size} units</p></div>
            <p className="font-semibold text-ink">{p.price_per_case == null ? <span className="text-saffron-700">quote</span> : formatINR(p.price_per_case * l.cases)}</p>
          </li>); })}
      </ul>
      <fieldset className="mt-3">
        <legend className="text-sm font-semibold text-ink">Delivery day</legend>
        <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
          {options.map((d, i) => { const k = dateKey(d); return (
            <button key={k} type="button" onClick={() => setDate(k)} className={cn("shrink-0 rounded-lg border px-3 py-2 text-sm", date === k ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-line bg-card text-ink-2")}>
              {i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
            </button>); })}
        </div>
      </fieldset>
      <Textarea label="Note for us (optional)" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="e.g. Deliver after 11 am, shop is on the first floor" className="mt-3" />
      <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
        <div className="flex justify-between"><dt className="text-ink-2">Items</dt><dd className="font-semibold text-ink">{formatINR(subtotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-2">Delivery</dt><dd className="font-semibold text-ink">{deliveryFee > 0 ? `${formatINR(deliveryFee)} + GST` : "No charge set"}</dd></div>
        <div className="flex justify-between text-xs"><dt className="text-ink-3">Payment</dt><dd className="text-ink-3">Cash or UPI on delivery</dd></div>
      </dl>
      {unpriced > 0 ? <Alert tone="warning" className="mt-3">{unpriced} item{unpriced === 1 ? " is" : "s are"} on quote and cannot be ordered online yet. Remove {unpriced === 1 ? "it" : "them"} or call us.</Alert> : null}
      {belowMin ? <Alert tone="warning" className="mt-3">Minimum wholesale order is {formatINR(minOrder)}.</Alert> : null}
      {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      <Button size="lg" fullWidth className="mt-4 h-13 rounded-xl text-base" onClick={submit} loading={busy} disabled={unpriced > 0 || belowMin || lines.length === 0}><PackageCheck className="h-4 w-4" /> Place wholesale order</Button>
      <p className="mt-2 text-center text-xs text-ink-3">Nothing is charged now. We call if anything is short in stock.</p>
    </BottomSheet>
  );
}
