"use client";
import * as React from "react";
import { Check, ChevronDown, Copy, ReceiptText } from "lucide-react";
import type { Order, OrderHistoryEntry, OrderItem } from "@/types/app";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { lineOptionsText } from "@/lib/cake";
import { CustomerOrderSteps } from "@/components/shop/order-status";
import { ProductImage } from "@/components/shop/product-image";
import { KeyValue } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { cn, formatDateTime, formatINR } from "@/lib/utils";
import { CardRow, TRACK_CARD } from "./cards";

/**
 * A row that opens what is under it. On a phone the content waits behind the row; `desktopOpen` keeps
 * it open from `lg` up, where there is room, and shows a plain heading instead of the toggle.
 */
function Disclosure({ id, label, aside, desktopOpen, className, children }: { id: string; label: string; aside?: React.ReactNode; desktopOpen?: boolean; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={cn("border-t border-line", className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}
        className={cn("tap flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm font-bold text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600", desktopOpen && "lg:hidden")}>
        <span>{label}</span>
        <span className="flex shrink-0 items-center gap-2">
          {aside}
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {desktopOpen ? <p className="hidden items-center justify-between gap-3 pb-1 pt-3.5 text-sm font-bold text-ink lg:flex"><span>{label}</span></p> : null}
      <div id={id} className={cn("pb-3 pt-1 motion-safe:animate-fade-in", !open && (desktopOpen ? "max-lg:hidden" : "hidden"))}>{children}</div>
    </div>
  );
}

/**
 * The order itself: its number (with a copy button), what was ordered, the bill and the status
 * timeline. Every figure is the order's own; the bill and the timeline open on a tap on phones.
 */
export function OrderSummaryCard({ order: o, items, history, active, paid }: { order: Order; items: OrderItem[]; history: OrderHistoryEntry[]; active: boolean; paid: boolean }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(t); }, [copied]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(o.order_number); setCopied(true); toast.success("Order number copied"); }
    catch { toast.error("Could not copy", `Your order number is ${o.order_number}.`); }
  };
  return (
    <section className={cn(TRACK_CARD, "pb-1")} aria-labelledby="track-summary">
      <h2 id="track-summary" className="font-display text-base font-bold text-ink">Order summary</h2>
      <CardRow className="mt-3" icon={<ReceiptText />} tone="neutral"
        title={<>Order <span className="tabular">{o.order_number}</span></>}
        subtitle={`${o.item_count} ${o.item_count === 1 ? "item" : "items"} · placed ${formatDateTime(o.created_at)}`}
        action={
          <button type="button" onClick={copy} aria-label="Copy order number"
            className="tap flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full bg-surface-2 text-ink-2 transition-colors duration-150 hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            {copied ? <Check className="h-5 w-5 text-brand-700" aria-hidden /> : <Copy className="h-[18px] w-[18px]" aria-hidden />}
          </button>
        } />

      <ul className="mt-3 divide-y divide-line border-t border-line">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-2.5">
            <ProductImage image={i.image_url} brand={i.brand_name} productName={i.product_name} packSize={i.pack_label} className="h-12 w-12 shrink-0 rounded-xl" sizes="48px" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{i.product_name}</span>
              <span className="block text-xs text-ink-3">{[i.pack_label, `${i.quantity} × ${formatINR(i.unit_price)}`].filter(Boolean).join(" · ")}</span>
              {lineOptionsText(i) ? <span className="block text-xs font-medium text-brand-800">{lineOptionsText(i)}</span> : null}
            </span>
            <span className="text-sm font-bold tabular text-ink">{formatINR(i.line_total)}</span>
          </li>
        ))}
      </ul>

      <Disclosure id="track-bill" label="View bill" desktopOpen aside={<span className="font-bold tabular text-ink">{formatINR(o.total, { precise: true })}</span>}>
        <KeyValue items={[
          { label: "Items", value: formatINR(o.subtotal) },
          ...(Number(o.coupon_discount) > 0 ? [{ label: `Coupon ${o.coupon_code}`, value: `− ${formatINR(o.coupon_discount)}` }] : []),
          { label: "Delivery", value: Number(o.delivery_fee) ? formatINR(o.delivery_fee) : "FREE" },
          ...(Number(o.platform_fee) > 0 ? [{ label: "Platform fee", value: formatINR(o.platform_fee) }] : []),
          ...(Number(o.tax_amount) > 0 ? [{ label: "GST on fees", value: formatINR(o.tax_amount, { precise: true }) }] : []),
          { label: "Total", value: formatINR(o.total, { precise: true }), strong: true },
        ]} />
        <p className="mt-3 text-xs text-ink-3">{PAYMENT_METHOD_LABEL[o.payment_method]} · {PAYMENT_STATUS_LABEL[o.payment_status]}</p>
      </Disclosure>

      {/* From `lg` up the timeline has a card of its own beside the map. */}
      <Disclosure id="track-updates" label="Order updates" className="lg:hidden">
        <div className="pt-2"><CustomerOrderSteps status={o.status} history={history} promisedAt={active ? o.promised_at : null} paid={paid} /></div>
      </Disclosure>
    </section>
  );
}
