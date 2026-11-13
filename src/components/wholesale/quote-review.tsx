"use client";
import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, PackageCheck, XCircle } from "lucide-react";
import { ProductImage } from "@/components/shop/product-image";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { respondWholesaleQuoteAction } from "@/lib/actions/wholesale";
import { restockDateLabel, type WholesaleOrder, type WholesaleSettings } from "@/lib/wholesale";
import { cn, formatINR, formatDateTime } from "@/lib/utils";

/**
 * The quote our team sent, exactly as it will be ordered: every line with the price we will charge,
 * and every item the customer wrote in either added as a real product or marked unavailable. Approving
 * is what lets an admin place it; nothing is packed or charged before that.
 */
export function QuoteReview({ order, settings }: { order: WholesaleOrder; settings?: WholesaleSettings }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<"approve" | "decline" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fee = order.delivery_fee ?? settings?.delivery_fee ?? 0;
  const requested = order.requested_items ?? [];
  const added = requested.filter((r) => r.status === "fulfilled");
  const missing = requested.filter((r) => r.status === "unavailable");

  const act = async (action: "approve" | "decline") => {
    setBusy(action); setError(null);
    const r = await respondWholesaleQuoteAction(order.id, action, note);
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    toast.success(action === "approve" ? "Quote approved" : "Quote declined",
      action === "approve" ? "We confirm stock and place it. Pay on delivery." : "Nothing will be delivered. Call us if you want to change anything.");
    router.refresh();
  };

  return (
    <section className="rounded-2xl border-2 border-saffron-300 bg-card p-4 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wide text-saffron-700">Your quote is ready</p>
      <h2 className="mt-0.5 font-display text-lg font-bold text-ink">Bulk order for {restockDateLabel(order.restock_date)}</h2>
      <p className="text-sm text-ink-2">These are the prices we will charge. Approve to let us place it, or decline if it does not suit you.</p>
      {order.quoted_at ? <p className="mt-0.5 text-xs text-ink-3">Sent {formatDateTime(order.quoted_at)}</p> : null}

      <ul className="mt-3 divide-y divide-line">
        {order.items.map((i) => (
          <li key={i.product_id} className="flex items-center gap-3 py-3">
            <ProductImage image={i.image_url} brand={null} productName={i.name} packSize={i.pack_label} className="h-12 w-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold text-ink">{i.name}</p>
              <p className="text-xs text-ink-3">{i.cases} × case of {i.case_size} · {i.units} units{i.price_per_case != null ? ` · ${formatINR(i.price_per_case)} / case` : ""}</p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular text-ink">{i.line_total != null ? formatINR(i.line_total) : "—"}</span>
          </li>
        ))}
      </ul>

      {added.length ? (
        <div className="mt-3 rounded-xl bg-success-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-800"><CheckCircle2 className="h-4 w-4" aria-hidden />What you asked for, added above</p>
          <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
            {added.map((r) => <li key={r.id}>&ldquo;{r.name}&rdquo; → <strong className="text-ink">{r.product_name}</strong>{r.cases ? ` · ${r.cases} case${r.cases === 1 ? "" : "s"}` : ""}{r.admin_note ? ` · ${r.admin_note}` : ""}</li>)}
          </ul>
        </div>
      ) : null}
      {missing.length ? (
        <div className="mt-2 rounded-xl bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><XCircle className="h-4 w-4 text-ink-3" aria-hidden />Not available this time</p>
          <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
            {missing.map((r) => <li key={r.id}>&ldquo;{r.name}&rdquo;{r.admin_note ? ` — ${r.admin_note}` : ""}</li>)}
          </ul>
        </div>
      ) : null}

      <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
        <div className="flex justify-between"><dt className="text-ink-2">Items</dt><dd className="font-semibold tabular text-ink">{formatINR(order.subtotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-2">Delivery</dt><dd className="font-semibold tabular text-ink">{fee > 0 ? `${formatINR(fee)} + GST` : "No charge"}</dd></div>
        <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><dt className="text-ink">Total</dt><dd className="tabular text-ink">{formatINR(order.subtotal + fee)}{fee > 0 ? " + GST on delivery" : ""}</dd></div>
        <div className="flex justify-between text-xs"><dt className="text-ink-3">Payment</dt><dd className="text-ink-3">Cash or UPI on delivery</dd></div>
      </dl>
      {order.quote_note ? <Alert tone="info" className="mt-3">{order.quote_note}</Alert> : null}

      <Textarea label="Note for us (optional)" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="e.g. Deliver after 11 am" className="mt-3" />
      {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      <div className="mt-3 flex gap-2">
        <Button size="lg" className="flex-1 rounded-xl" onClick={() => act("approve")} loading={busy === "approve"}><PackageCheck className="h-4 w-4" aria-hidden /> Approve {formatINR(order.subtotal + fee)}</Button>
        <Button size="lg" variant="outline" className="rounded-xl" onClick={() => act("decline")} loading={busy === "decline"}>Decline</Button>
      </div>
    </section>
  );
}

/** A bulk order that is with us: what was sent, and what is still being priced. No promises about timing. */
export function PendingRequestCard({ order, quoteHours }: { order: WholesaleOrder; quoteHours: number }) {
  const requested = order.requested_items ?? [];
  const unpricedLines = order.items.filter((i) => i.price_per_case == null);
  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-card">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-3"><Clock className="h-3.5 w-3.5" aria-hidden />{order.status === "reviewing" ? "We are checking it" : "Sent to us"}</p>
      <h2 className="mt-0.5 font-display text-lg font-bold text-ink">Bulk order for {restockDateLabel(order.restock_date)}</h2>
      <p className="text-sm text-ink-2">We are confirming stock and price. You will get a quote to approve, usually within {quoteHours} hour{quoteHours === 1 ? "" : "s"}. Nothing is packed or charged until then.</p>
      <ul className="mt-3 space-y-1 text-sm text-ink-2">
        {order.items.map((i) => (
          <li key={i.product_id} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{i.cases} × {i.name}</span>
            <span className={cn("shrink-0 tabular", i.price_per_case == null && "font-semibold text-saffron-700")}>{i.line_total != null ? formatINR(i.line_total) : "being priced"}</span>
          </li>
        ))}
        {requested.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate">{r.quantity} {r.unit} · {r.name}{r.brand ? ` (${r.brand})` : ""}</span>
              {r.notes ? <span className="block truncate text-xs text-ink-3">{r.notes}</span> : null}
            </span>
            <span className="shrink-0 text-xs font-semibold text-saffron-700">being priced</span>
          </li>
        ))}
      </ul>
      {requested.some((r) => r.photo_url) ? (
        <div className="mt-2 flex gap-2">
          {requested.filter((r) => r.photo_url).map((r) => (
            <span key={r.id} className="relative h-14 w-14 overflow-hidden rounded-lg border border-line">
              <Image src={r.photo_url!} alt={`Photo for ${r.name}`} fill sizes="56px" className="object-cover" />
            </span>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-ink-3">{order.items.length + requested.length} line{order.items.length + requested.length === 1 ? "" : "s"}{unpricedLines.length + requested.length > 0 ? ` · ${unpricedLines.length + requested.length} waiting for our price` : ""}</p>
    </section>
  );
}
