"use client";
import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { BottomSheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { adminQuoteWholesaleOrderAction } from "@/lib/actions/wholesale";
import { formatINR, cn } from "@/lib/utils";
import { REQUESTED_LINE_LABEL, type AdminWholesaleProduct, type RequestedLineStatus, type WholesaleOrder } from "@/lib/wholesale";

type Line = { product_id: string; cases: number };
type Resolution = { id: string; status: RequestedLineStatus; product_id: string | null; adminNote: string };

/**
 * Price a bulk order. Catalogue lines are edited as cases; each item the customer wrote in is either
 * matched to a wholesale product that is already priced (which adds it to the lines) or marked
 * unavailable. Prices come only from the wholesale product rows — nothing is typed in here, so a quote
 * can never name a price the catalogue does not carry. "Send" puts it in front of the customer.
 */
export function QuoteEditor({ order, products }: { order: WholesaleOrder; products: AdminWholesaleProduct[] }) {
  const router = useRouter();
  const [lines, setLines] = React.useState<Line[]>(order.items.map((i) => ({ product_id: i.product_id, cases: i.cases })));
  const [resolutions, setResolutions] = React.useState<Resolution[]>(
    (order.requested_items ?? []).map((r) => ({ id: r.id, status: r.status, product_id: r.product_id, adminNote: r.admin_note ?? "" })));
  const [fee, setFee] = React.useState(String(order.delivery_fee ?? 0));
  const [note, setNote] = React.useState(order.quote_note ?? "");
  const [busy, setBusy] = React.useState<"save" | "send" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [picking, setPicking] = React.useState<string | null>(null);   // requested line id, or "line" for a plain add
  const [query, setQuery] = React.useState("");

  const byId = React.useMemo(() => Object.fromEntries(products.map((p) => [p.product_id, p])), [products]);
  const nameOf = (id: string) => byId[id]?.name ?? order.items.find((i) => i.product_id === id)?.name ?? "Product";
  const priceOf = (id: string) => byId[id]?.price_per_case ?? null;
  const subtotal = lines.reduce((a, l) => a + (priceOf(l.product_id) ?? 0) * l.cases, 0);
  const unpriced = lines.filter((l) => priceOf(l.product_id) == null);
  const pending = resolutions.filter((r) => r.status === "pending");
  const requested = order.requested_items ?? [];

  const setCases = (id: string, cases: number) => setLines((ls) => cases <= 0 ? ls.filter((l) => l.product_id !== id)
    : ls.some((l) => l.product_id === id) ? ls.map((l) => (l.product_id === id ? { ...l, cases } : l)) : [...ls, { product_id: id, cases }]);
  const resolve = (id: string, patch: Partial<Resolution>) => setResolutions((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const match = (requestedId: string, productId: string) => {
    const p = byId[productId];
    if (!p) return;
    setCases(productId, Math.max(lines.find((l) => l.product_id === productId)?.cases ?? 0, p.moq_cases || 1));
    resolve(requestedId, { status: "fulfilled", product_id: productId });
    setPicking(null); setQuery("");
  };

  const submit = async (action: "save" | "send") => {
    setBusy(action); setError(null);
    const r = await adminQuoteWholesaleOrderAction({ id: order.id, items: lines, requested: resolutions, deliveryFee: Number(fee) || 0, note, action });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    toast.success(action === "send" ? "Quote sent" : "Quote saved", action === "send" ? "The customer has been asked to approve it." : "Nothing has been sent to the customer yet.");
    router.refresh();
  };

  const results = query.trim() ? products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())) : products;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Order lines</p>
        <ul className="mt-1 divide-y divide-line rounded-lg border border-line">
          {lines.map((l) => {
            const price = priceOf(l.product_id); const p = byId[l.product_id];
            return (
              <li key={l.product_id} className="flex items-center gap-2 px-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{nameOf(l.product_id)}</p>
                  <p className="text-xs text-ink-3">{price == null ? <span className="font-semibold text-danger">no wholesale price set</span> : `${formatINR(price)} / case`}{p ? ` · case of ${p.case_size} · stock ${p.stock_qty ?? 0}` : ""}</p>
                </div>
                <Input type="number" inputMode="numeric" min={0} value={String(l.cases)} aria-label={`Cases of ${nameOf(l.product_id)}`} className="w-20"
                  onChange={(e) => setCases(l.product_id, Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
                <span className="w-20 shrink-0 text-right tabular text-ink">{price != null ? formatINR(price * l.cases) : "—"}</span>
                <button type="button" onClick={() => setCases(l.product_id, 0)} aria-label={`Remove ${nameOf(l.product_id)}`} className="tap flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2"><Trash2 className="h-4 w-4" /></button>
              </li>
            );
          })}
          {lines.length === 0 ? <li className="px-3 py-4 text-center text-sm text-ink-3">No lines yet.</li> : null}
        </ul>
        <Button size="xs" variant="ghost" className="mt-1" onClick={() => setPicking("line")}><Plus className="h-4 w-4" /> Add a wholesale product</Button>
      </div>

      {requested.length ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-3">What the customer wrote ({requested.length})</p>
          <ul className="mt-1 space-y-2">
            {requested.map((r) => {
              const res = resolutions.find((x) => x.id === r.id);
              return (
                <li key={r.id} className={cn("rounded-lg border p-2.5", res?.status === "pending" ? "border-saffron-300 bg-saffron-50" : "border-line bg-card")}>
                  <div className="flex items-start gap-2.5">
                    {r.photo_url ? <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-line"><Image src={r.photo_url} alt={`Photo for ${r.name}`} fill sizes="56px" className="object-cover" /></span> : null}
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold text-ink">{r.name}{r.brand ? <span className="font-normal text-ink-2"> · {r.brand}</span> : null}</p>
                      <p className="text-xs text-ink-2">{r.quantity} {r.unit}{r.notes ? ` · ${r.notes}` : ""}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-ink-3">{REQUESTED_LINE_LABEL[res?.status ?? "pending"]}{res?.product_id ? ` · ${nameOf(res.product_id)}` : ""}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Button size="xs" variant={res?.status === "fulfilled" ? "primary" : "outline"} onClick={() => setPicking(r.id)}><Check className="h-3.5 w-3.5" /> {res?.product_id ? "Change product" : "Match a product"}</Button>
                    <Button size="xs" variant={res?.status === "unavailable" ? "primary" : "outline"} onClick={() => resolve(r.id, { status: "unavailable", product_id: null })}><X className="h-3.5 w-3.5" /> Not available</Button>
                  </div>
                  <Input value={res?.adminNote ?? ""} onChange={(e) => resolve(r.id, { adminNote: e.target.value.slice(0, 300) })} placeholder="Reason or note the customer will see" aria-label={`Note for ${r.name}`} className="mt-1.5" />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Input label="Delivery fee (₹)" type="number" inputMode="decimal" min={0} value={fee} onChange={(e) => setFee(e.target.value)} hint="GST is added on this at placing." />
        <div className="flex items-end"><dl className="w-full rounded-lg bg-surface px-3 py-2 text-sm"><div className="flex justify-between"><dt className="text-ink-3">Items</dt><dd className="font-semibold tabular text-ink">{formatINR(subtotal)}</dd></div><div className="flex justify-between"><dt className="text-ink-3">Customer pays</dt><dd className="font-bold tabular text-ink">{formatINR(subtotal + (Number(fee) || 0))}</dd></div></dl></div>
      </div>
      <Textarea label="Message with the quote (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Besan is out this week; the rest is ready." />

      {unpriced.length ? <Alert tone="danger">{unpriced.length} line{unpriced.length === 1 ? " has" : "s have"} no wholesale price. Set one under Products &amp; prices before sending.</Alert> : null}
      {pending.length ? <Alert tone="warning">{pending.length} written item{pending.length === 1 ? "" : "s"} still open. Match {pending.length === 1 ? "it" : "each"} to a product or mark {pending.length === 1 ? "it" : "them"} not available.</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => submit("send")} loading={busy === "send"} disabled={lines.length === 0 || unpriced.length > 0 || pending.length > 0}><Send className="h-4 w-4" /> Send quote</Button>
        <Button size="sm" variant="outline" onClick={() => submit("save")} loading={busy === "save"}>Save without sending</Button>
      </div>

      <BottomSheet open={picking !== null} onClose={() => setPicking(null)} title={picking && picking !== "line" ? "Match a wholesale product" : "Add a wholesale product"}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search wholesale products" leftIcon={<Search className="h-4 w-4" />} aria-label="Search wholesale products" />
        <ul className="mt-2 max-h-[55vh] space-y-1 overflow-y-auto">
          {results.map((p) => (
            <li key={p.product_id}>
              <button type="button" disabled={p.price_per_case == null}
                onClick={() => (picking === "line" ? (setCases(p.product_id, Math.max(lines.find((l) => l.product_id === p.product_id)?.cases ?? 0, p.moq_cases || 1)), setPicking(null)) : match(picking!, p.product_id))}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                  <span className="block text-xs text-ink-3">case of {p.case_size} · min {p.moq_cases} · stock {p.stock_qty ?? 0} · {p.price_per_case == null ? "no wholesale price yet" : `${formatINR(p.price_per_case)} / case`}</span>
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 ? <li className="py-6 text-center text-sm text-ink-3">Nothing matches. Add the product under Products &amp; prices first.</li> : null}
        </ul>
        <p className="mt-2 text-xs text-ink-3">Only products that already carry a wholesale price can be quoted. Set one under Products &amp; prices if it is missing.</p>
      </BottomSheet>
    </div>
  );
}

/** One line of context for the admin list: who asked, where it goes, and what is open. */
export function QuoteSummary({ order }: { order: WholesaleOrder }) {
  const requested = order.requested_items ?? [];
  const open = requested.filter((r) => r.status === "pending").length;
  if (requested.length === 0 && !order.address && !order.delivery_notes) return null;
  return (
    <div className="mt-2 rounded-md bg-surface px-2.5 py-2 text-xs text-ink-2">
      {order.address ? <p><span className="font-semibold text-ink">Deliver to:</span> {[order.address.house, order.address.street, order.address.area, `${order.address.city} – ${order.address.pincode}`].filter(Boolean).join(", ")}</p> : null}
      {order.contact_name || order.contact_phone ? <p><span className="font-semibold text-ink">Contact:</span> {order.contact_name}{order.contact_phone ? ` · ${order.contact_phone}` : ""}</p> : null}
      {order.delivery_notes ? <p><span className="font-semibold text-ink">Instructions:</span> {order.delivery_notes}</p> : null}
      {requested.length ? (
        <p className="mt-1"><span className="font-semibold text-ink">Written in ({requested.length}{open ? `, ${open} open` : ""}):</span> {requested.map((r) => `${r.quantity} ${r.unit} ${r.name}`).join("; ")}</p>
      ) : null}
    </div>
  );
}
