import Link from "next/link";
import { lineOptionsText } from "@/lib/cake";
import { Bike, ClipboardList, Clock, CreditCard, History, MapPin, MessageSquareText, Package, Phone, Receipt, ShieldCheck, Store as StoreIcon, User, type LucideIcon } from "lucide-react";
import type { OrderTracking } from "@/types/app";
import { OrderTimeline } from "@/components/shop/order-status";
import { ProductImage } from "@/components/shop/product-image";
import { DetailList, OrderStatusPill, PaymentStatusPill, paymentMethodLabel, StatusPill, StatusText } from "@/components/admin/kit";
import { ORDER_STATUS_META } from "@/lib/order-status";
import { VEHICLE_LABEL } from "@/components/admin/ops/pills";
import { SupportConfirmDelivery } from "./rider-payouts";
import { cn, formatINR, formatDateTime, formatTime, minutesUntil, timeAgo } from "@/lib/utils";

export type AddressSnapshot = { full_name: string; phone: string; house: string; street: string; area: string; landmark?: string; city: string; pincode: string; lat?: number; lng?: number };

const TERMINAL = ["delivered", "completed", "cancelled", "rejected"];

/** A gap in minutes as words an operator reads at a glance: "12 min", "2 hr 5 min", "3 d". */
export function minutesLabel(minutes: number) {
  const m = Math.abs(Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}`;
  return `${Math.floor(m / 1440)} d`;
}

/** Section heading: an icon plus the words, never an icon alone. */
function Heading({ icon: Icon, children, id }: { icon: LucideIcon; children: React.ReactNode; id?: string }) {
  return <h3 id={id} className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3"><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />{children}</h3>;
}

/** Tap-to-call link that says what it does; a full-height touch target on phones. */
function CallLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} className={cn("mt-1 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line-2 bg-card px-2.5 text-sm font-semibold text-brand-700 transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600 pointer-coarse:min-h-11 motion-reduce:transition-none", className)}>
      <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />{children}
    </a>
  );
}

/**
 * Order facts shared by the quick-view panel and the full order page. Server component.
 * Reading order, top to bottom: status and payment with the promise time → customer → delivery
 * address and instructions → pickup point → rider → items → bill → timeline. The actions (with any
 * exception notice) follow in `OrderAdminActions`.
 */
export function OrderFacts({ t, compact }: { t: OrderTracking; compact?: boolean }) {
  const o = t.order;
  const addr = o.address_snapshot as unknown as AddressSnapshot;
  const phone = addr.phone || t.customer?.phone || "";
  const closed = TERMINAL.includes(o.status);
  const done = o.status === "delivered" || o.status === "completed";
  const eta = minutesUntil(o.promised_at);
  const late = eta != null && eta < 0 && !closed;
  // Delivered: how the real delivery time compares with the promise (both are stored on the order).
  const overrun = done && o.delivered_at && o.promised_at ? Math.round((new Date(o.delivered_at).getTime() - new Date(o.promised_at).getTime()) / 60000) : null;
  const farOff = eta != null && Math.abs(eta) > 12 * 60;
  const a = t.assignment;
  const riderOn = a && a.status !== "offered";

  return (
    <div className="space-y-5">
      <section aria-label="Status, payment and promise time">
        <dl className="grid gap-3 rounded-xl border border-line bg-surface px-3 py-3 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink-3"><ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden />Order status</dt>
            <dd><OrderStatusPill status={o.status} /></dd>
          </div>
          <div className="min-w-0">
            <dt className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink-3"><CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden />Payment</dt>
            <dd className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-sm font-medium text-ink">{paymentMethodLabel(o.payment_method, true)}</span><PaymentStatusPill status={o.payment_status} /></dd>
          </div>
          <div className="min-w-0">
            <dt className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink-3"><Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />{done && o.delivered_at ? "Delivered" : "Promised by"}</dt>
            <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {done && o.delivered_at ? (
                <>
                  <span className="text-sm font-medium tabular text-ink">{formatDateTime(o.delivered_at)}</span>
                  {overrun != null ? <StatusPill tone={overrun > 0 ? "amber" : "green"}>{overrun > 0 ? `${minutesLabel(overrun)} after the promise` : "Within the promised time"}</StatusPill> : null}
                </>
              ) : o.promised_at ? (
                <>
                  <span className="text-sm font-medium tabular text-ink">{farOff ? formatDateTime(o.promised_at) : formatTime(o.promised_at)}</span>
                  {late ? <StatusPill tone="red">{minutesLabel(eta!)} late</StatusPill> : !closed && eta != null ? <StatusPill tone="neutral">{eta === 0 ? "Due now" : `${minutesLabel(eta)} left`}</StatusPill> : null}
                </>
              ) : <span className="text-sm text-ink-3">No promise time on this order</span>}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-sm text-ink-3">{ORDER_STATUS_META[o.status].description}{o.cancel_reason ? ` · ${o.cancel_reason}` : ""}{o.reject_reason ? ` · ${o.reject_reason}` : ""}</p>
      </section>

      {o.status === "out_for_delivery" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-saffron-200 bg-saffron-50 px-3 py-2.5">
          <ShieldCheck className="h-5 w-5 shrink-0 text-saffron-700" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-ink">{t.otp_locked ? "Delivery OTP locked after too many wrong tries" : "Handover needs the customer’s delivery OTP"}</p>
            <p className="text-xs text-ink-3">Only the customer can see the OTP. If they can&rsquo;t reach it, confirm with them by phone and complete it here (audited).</p>
          </div>
          <SupportConfirmDelivery orderId={o.id} cod={o.payment_method === "cod"} total={Number(o.total)} />
        </div>
      ) : null}

      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        <section aria-labelledby="qv-customer" className="min-w-0">
          <Heading icon={User} id="qv-customer">Customer</Heading>
          <Link href={`/admin/users/${o.user_id}`} className="block break-words text-sm font-medium text-ink hover:underline">{addr.full_name || t.customer?.name || "Customer"}</Link>
          {phone ? <CallLink href={`tel:+91${phone}`}>Call +91 {phone}</CallLink> : <p className="mt-0.5 text-xs text-ink-3">No phone number on this order</p>}
        </section>

        <section aria-labelledby="qv-address" className="min-w-0">
          <Heading icon={MapPin} id="qv-address">Deliver to</Heading>
          <p className="break-words text-sm text-ink-2">{[addr.house, addr.street, addr.area, addr.landmark, `${addr.city} – ${addr.pincode}`].filter(Boolean).join(", ")}</p>
          <p className="mt-1 text-xs capitalize text-ink-3">{o.delivery_type} delivery{o.scheduled_slot_start ? ` · ${formatDateTime(o.scheduled_slot_start)}–${formatTime(o.scheduled_slot_end)}` : ""}</p>
          {o.delivery_instructions ? (
            <div className="mt-2 rounded-lg border border-line bg-surface px-2.5 py-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-3"><MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden />Delivery instructions</p>
              <p className="mt-0.5 break-words text-sm text-ink">{o.delivery_instructions}</p>
            </div>
          ) : <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-4"><MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden />No delivery instructions</p>}
          {o.customer_note ? <p className="mt-1.5 break-words text-xs text-ink-2"><span className="font-semibold text-ink-3">Note from the customer: </span>{o.customer_note}</p> : null}
        </section>

        <section aria-labelledby="qv-pickup" className="min-w-0">
          <Heading icon={StoreIcon} id="qv-pickup">Pickup point</Heading>
          <p className="text-sm font-medium text-ink">{t.pickup.name}</p>
          <p className="break-words text-xs text-ink-3">{[t.pickup.address_line1, t.pickup.area].filter(Boolean).join(", ") || "No address saved for the pickup point"}</p>
        </section>

        <section aria-labelledby="qv-rider" className="min-w-0">
          <Heading icon={Bike} id="qv-rider">Rider</Heading>
          {riderOn ? (
            <>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink">{a.rider.name ?? "Rider"}<StatusText value={a.status} /></p>
              <p className="mt-0.5 text-xs text-ink-3">
                {[VEHICLE_LABEL[a.rider.vehicle_type as keyof typeof VEHICLE_LABEL] ?? a.rider.vehicle_type, a.rider.vehicle_number].filter(Boolean).join(" · ")}
                {a.last_location ? ` · last GPS fix ${timeAgo(a.last_location.recorded_at)}` : ["accepted", "picked_up"].includes(a.status) ? " · no GPS fix yet" : ""}
              </p>
              {a.rider.phone ? <CallLink href={`tel:${a.rider.phone}`}>Call rider {a.rider.phone}</CallLink> : <p className="mt-0.5 text-xs text-ink-3">No phone number for this rider</p>}
            </>
          ) : a ? (
            <>
              <StatusPill tone="amber">Offer sent · waiting for a rider to accept</StatusPill>
              <p className="mt-1 text-xs text-ink-3">The offer stays open until {formatTime(a.expires_at)}.</p>
            </>
          ) : <StatusPill tone="neutral">Not assigned yet</StatusPill>}
        </section>
      </div>

      <section aria-labelledby="qv-items">
        <Heading icon={Package} id="qv-items">Items ({o.item_count})</Heading>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {t.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2">
              <ProductImage image={i.image_url} productName={i.product_name} className="h-10 w-10 shrink-0 rounded-lg" sizes="40px" />
              <span className="min-w-0 flex-1">
                <Link href={`/admin/products/${i.product_id}`} className="line-clamp-2 text-sm font-medium text-ink hover:underline">{i.product_name}</Link>
                <span className="block text-xs text-ink-3">{i.pack_label ? `${i.pack_label} · ` : ""}<span className="font-semibold text-ink-2">Qty {i.quantity}</span> × {formatINR(i.unit_price)}</span>
                {lineOptionsText(i) ? <span className="block text-xs font-semibold text-saffron-700">{lineOptionsText(i)}</span> : null}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular text-ink">{formatINR(i.line_total)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="qv-totals">
        <Heading icon={Receipt} id="qv-totals">Bill</Heading>
        <DetailList items={[
          { label: "Items", value: formatINR(o.subtotal) },
          ...(Number(o.item_discount) > 0 ? [{ label: "MRP savings", value: `− ${formatINR(o.item_discount)}` }] : []),
          ...(Number(o.coupon_discount) > 0 ? [{ label: `Coupon ${o.coupon_code ?? ""}`, value: `− ${formatINR(o.coupon_discount)}` }] : []),
          { label: "Delivery", value: Number(o.delivery_fee) ? formatINR(o.delivery_fee) : "Free" },
          ...(Number(o.platform_fee) > 0 ? [{ label: "Platform fee", value: formatINR(o.platform_fee) }] : []),
          ...(Number(o.tax_amount) > 0 ? [{ label: "GST on fees", value: formatINR(o.tax_amount, { precise: true }) }] : []),
          { label: "Total", value: formatINR(o.total, { precise: true }), strong: true },
        ]} />
        {!compact ? <p className="mt-2 text-xs text-ink-3">Rider earning {formatINR(o.rider_earning)}</p> : null}
        {t.payment ? <p className="mt-1 text-xs text-ink-3">Provider {t.payment.provider}{t.payment.provider_order_id ? ` · ${t.payment.provider_order_id}` : ""}{t.payment.refund_required ? " · refund required" : ""}</p> : null}
      </section>

      <section aria-labelledby="qv-timeline">
        <Heading icon={History} id="qv-timeline">Timeline</Heading>
        <OrderTimeline status={o.status} history={t.history} promisedAt={o.promised_at} />
        <p className="mt-2 text-xs text-ink-4">Placed {formatDateTime(o.created_at)}</p>
      </section>
    </div>
  );
}
