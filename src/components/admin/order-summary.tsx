import Link from "next/link";
import { MapPin, Phone, ShieldCheck, Store as StoreIcon, User, Bike } from "lucide-react";
import type { OrderTracking } from "@/types/app";
import { OrderTimeline } from "@/components/shop/order-status";
import { ProductImage } from "@/components/shop/product-image";
import { DetailList, OrderStatusPill, PaymentStatusPill, paymentMethodLabel, StatusPill } from "@/components/admin/kit";
import { ORDER_STATUS_META } from "@/lib/order-status";
import { formatINR, formatDateTime, formatTime, minutesUntil } from "@/lib/utils";

export type AddressSnapshot = { full_name: string; phone: string; house: string; street: string; area: string; landmark?: string; city: string; pincode: string; lat?: number; lng?: number };

const TERMINAL = ["delivered", "completed", "cancelled", "rejected"];

/** Order facts shared by the quick-view panel and the full order page. Server component. */
export function OrderFacts({ t, compact }: { t: OrderTracking; compact?: boolean }) {
  const o = t.order;
  const addr = o.address_snapshot as unknown as AddressSnapshot;
  const eta = minutesUntil(o.promised_at);
  const late = eta != null && eta < 0 && !TERMINAL.includes(o.status);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusPill status={o.status} />
        <span className="text-xs text-ink-3">Payment</span>
        <span className="text-xs font-medium text-ink-2">{paymentMethodLabel(o.payment_method, true)}</span>
        <PaymentStatusPill status={o.payment_status} />
        {late ? <StatusPill tone="red">{Math.abs(eta!)} min late</StatusPill> : null}
      </div>
      <p className="-mt-3 text-sm text-ink-3">{ORDER_STATUS_META[o.status].description}{o.promised_at && !TERMINAL.includes(o.status) ? ` · promised by ${formatTime(o.promised_at)}` : ""}{o.cancel_reason ? ` · ${o.cancel_reason}` : ""}{o.reject_reason ? ` · ${o.reject_reason}` : ""}</p>

      {t.delivery_otp && !TERMINAL.includes(o.status) ? (
        <div className="flex items-center gap-3 rounded-xl border border-saffron-200 bg-saffron-50 px-3 py-2.5">
          <ShieldCheck className="h-5 w-5 text-saffron-700" aria-hidden />
          <div><p className="text-xs font-medium text-saffron-700">Delivery OTP</p><p className="font-display text-lg font-bold tracking-[0.25em] text-ink">{t.delivery_otp}</p></div>
        </div>
      ) : null}

      <section aria-labelledby="qv-customer" className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 id="qv-customer" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3"><User className="h-3.5 w-3.5" aria-hidden />Customer</h3>
          <Link href={`/admin/users/${o.user_id}`} className="text-sm font-medium text-ink hover:underline">{addr.full_name}</Link>
          <a href={`tel:+91${addr.phone}`} className="mt-0.5 flex items-center gap-1 text-sm text-brand-700 hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden />+91 {addr.phone}</a>
        </div>
        <div>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3"><MapPin className="h-3.5 w-3.5" aria-hidden />Deliver to</h3>
          <p className="text-sm text-ink-2">{[addr.house, addr.street, addr.area, addr.landmark, `${addr.city} – ${addr.pincode}`].filter(Boolean).join(", ")}</p>
          {o.delivery_instructions ? <p className="mt-1 rounded-lg bg-surface px-2 py-1.5 text-xs text-ink-2">“{o.delivery_instructions}”</p> : null}
          {o.customer_note ? <p className="mt-1 text-xs text-ink-3">Note: {o.customer_note}</p> : null}
          <p className="mt-1 text-xs capitalize text-ink-3">{o.delivery_type} delivery{o.scheduled_slot_start ? ` · ${formatDateTime(o.scheduled_slot_start)}–${formatTime(o.scheduled_slot_end)}` : ""}</p>
        </div>
        <div>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3"><StoreIcon className="h-3.5 w-3.5" aria-hidden />Fulfilled by</h3>
          <Link href={`/admin/stores/${t.store.id}`} className="text-sm font-medium text-ink hover:underline">{t.store.name}</Link>
          <p className="text-xs text-ink-3">{t.store.area}</p>
        </div>
        <div>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3"><Bike className="h-3.5 w-3.5" aria-hidden />Rider</h3>
          {t.assignment && t.assignment.status !== "offered" ? (
            <>
              <p className="text-sm font-medium text-ink">{t.assignment.rider.name ?? "Rider"}</p>
              {t.assignment.rider.phone ? <a href={`tel:${t.assignment.rider.phone}`} className="text-sm text-brand-700 hover:underline">{t.assignment.rider.phone}</a> : null}
            </>
          ) : <p className="text-sm text-ink-3">{t.assignment?.status === "offered" ? "Offer sent, waiting for a rider to accept" : "Not assigned yet"}</p>}
        </div>
      </section>

      <section aria-labelledby="qv-items">
        <h3 id="qv-items" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Items ({o.item_count})</h3>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {t.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2">
              <ProductImage image={i.image_url} productName={i.product_name} className="h-10 w-10 shrink-0 rounded-lg" sizes="40px" />
              <span className="min-w-0 flex-1">
                <Link href={`/admin/products/${i.product_id}`} className="line-clamp-1 text-sm font-medium text-ink hover:underline">{i.product_name}</Link>
                <span className="text-xs text-ink-3">{i.pack_label} · {i.quantity} × {formatINR(i.unit_price)}</span>
              </span>
              <span className="text-sm font-semibold tabular text-ink">{formatINR(i.line_total)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="qv-totals">
        <h3 id="qv-totals" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Totals</h3>
        <DetailList items={[
          { label: "Items", value: formatINR(o.subtotal) },
          ...(Number(o.item_discount) > 0 ? [{ label: "MRP savings", value: `− ${formatINR(o.item_discount)}` }] : []),
          ...(Number(o.coupon_discount) > 0 ? [{ label: `Coupon ${o.coupon_code ?? ""}`, value: `− ${formatINR(o.coupon_discount)}` }] : []),
          { label: "Delivery", value: Number(o.delivery_fee) ? formatINR(o.delivery_fee) : "Free" },
          ...(Number(o.platform_fee) > 0 ? [{ label: "Platform fee", value: formatINR(o.platform_fee) }] : []),
          ...(Number(o.tax_amount) > 0 ? [{ label: "GST on fees", value: formatINR(o.tax_amount, { precise: true }) }] : []),
          { label: "Total", value: formatINR(o.total, { precise: true }), strong: true },
        ]} />
        {!compact ? <p className="mt-2 text-xs text-ink-3">Commission {o.commission_rate}% = {formatINR(o.commission_amount, { precise: true })} · Store payout {formatINR(o.store_payout_amount, { precise: true })} · Rider earning {formatINR(o.rider_earning)}</p> : null}
        {t.payment ? <p className="mt-1 text-xs text-ink-3">Provider {t.payment.provider}{t.payment.provider_order_id ? ` · ${t.payment.provider_order_id}` : ""}{t.payment.refund_required ? " · refund required" : ""}</p> : null}
      </section>

      <section aria-labelledby="qv-timeline">
        <h3 id="qv-timeline" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Timeline</h3>
        <OrderTimeline status={o.status} history={t.history} promisedAt={o.promised_at} />
        <p className="mt-2 text-xs text-ink-4">Placed {formatDateTime(o.created_at)}</p>
      </section>
    </div>
  );
}
