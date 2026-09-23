"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Phone, MapPin, Bike, ShieldCheck, Wifi, WifiOff, CalendarClock, Zap, MessageSquareText, Info } from "lucide-react";
import type { OrderTracking } from "@/types/app";
import { getOrderTrackingAction } from "@/lib/actions/tracking";
import { useOrderRealtime } from "@/hooks/use-order-realtime";
import { ORDER_STATUS_META, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { OrderTimeline, OrderStatusBadge } from "@/components/shop/order-status";
import { ProductImage } from "@/components/shop/product-image";
import { Alert } from "@/components/ui/states";
import { KeyValue, Avatar, StarRating } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { OrderActions } from "./order-actions";
import { PaymentBadge, customerFromSnapshot } from "./order-row";
import { isPaymentPending } from "./constants";
import { formatINR, formatDateTime, formatTime, cn } from "@/lib/utils";

/** Store view of one order: items to pack, customer + delivery details, timeline, rider, actions. Live via Realtime. */
export function StoreOrderDetail({ initial }: { initial: OrderTracking }) {
  const router = useRouter();
  const [t, setT] = React.useState(initial);
  const [seen, setSeen] = React.useState(initial);
  if (seen !== initial) { setSeen(initial); setT(initial); }
  const refresh = React.useCallback(async () => { const n = await getOrderTrackingAction(t.order.id); if (n) setT(n); }, [t.order.id]);
  const connected = useOrderRealtime(t.order.id, t.assignment?.id ?? null, refresh);

  const o = t.order; const meta = ORDER_STATUS_META[o.status];
  const c = customerFromSnapshot(o.address_snapshot);
  const unpaid = isPaymentPending(o);
  const terminal = ["delivered", "completed", "cancelled", "rejected"].includes(o.status);
  const actionable = ["placed", "store_confirmed", "preparing"].includes(o.status);
  const rider = t.assignment && t.assignment.status !== "offered" && t.assignment.status !== "rejected" && t.assignment.status !== "expired" ? t.assignment : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {unpaid && o.status === "placed" ? <Alert tone="warning" title="Payment pending — cannot accept yet">This is an online order and the payment has not arrived. The Accept button unlocks automatically once Razorpay confirms it; if the customer does not pay, the order will expire on its own.</Alert> : null}
        {o.status === "rejected" && o.reject_reason ? <Alert tone="danger" title="Rejected">{o.reject_reason}</Alert> : null}
        {o.status === "cancelled" ? <Alert tone="danger" title="Cancelled by customer">{o.cancel_reason ?? "No reason given."}</Alert> : null}

        <section className="rounded-lg border border-line bg-card p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-xs text-ink-3">{o.order_number}{o.short_code ? <span className="font-mono">#{o.short_code}</span> : null}{o.delivery_type === "express" ? <Badge tone="saffron" size="xs"><Zap className="h-3 w-3" /> Express</Badge> : null}{o.delivery_type === "scheduled" && o.scheduled_slot_start ? <Badge tone="info" size="xs"><CalendarClock className="h-3 w-3" /> {formatDateTime(o.scheduled_slot_start)}</Badge> : null}</p>
              <h2 className="text-lg font-bold text-ink">{meta.label}</h2>
              <p className="text-sm text-ink-3">{o.status === "placed" ? "Accept quickly — the customer is waiting for confirmation." : o.status === "ready_for_pickup" ? "Waiting for a rider to accept the delivery." : meta.description}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5"><OrderStatusBadge status={o.status} size="md" /><span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold", connected ? "text-success" : "text-ink-4")}>{connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{connected ? "Live" : "Polling"}</span></div>
          </div>
          {actionable ? <div className="mt-4 border-t border-line pt-4"><OrderActions order={o} onDone={() => { refresh(); router.refresh(); }} /></div> : null}
          {!terminal && !actionable ? <p className="mt-4 flex items-start gap-2 rounded-md bg-surface px-3 py-2.5 text-xs text-ink-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><span><strong>Delivered</strong> is set only by the rider after the customer&apos;s OTP is verified at handover. Stores cannot mark an order delivered.</span></p> : null}
        </section>

        <section className="rounded-lg border border-line bg-card p-4 shadow-card">
          <h2 className="mb-3 text-base font-bold text-ink">Pack these items ({o.item_count})</h2>
          <ul className="divide-y divide-line">
            {t.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <ProductImage image={i.image_url} productName={i.product_name} packSize={i.pack_label} className="h-12 w-12 shrink-0 rounded-sm" sizes="48px" />
                <span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium text-ink">{i.product_name}</span><span className="text-xs text-ink-3">{i.pack_label}{i.brand_name ? ` · ${i.brand_name}` : ""} · {formatINR(i.unit_price)} each</span></span>
                <span className="flex shrink-0 items-center gap-3"><span className="rounded-sm bg-brand-50 px-2.5 py-1 text-base font-extrabold tabular text-brand-700">×{i.quantity}</span><span className="w-16 text-right text-sm font-bold tabular text-ink">{formatINR(i.line_total)}</span></span>
              </li>
            ))}
          </ul>
          {o.customer_note ? <p className="mt-3 flex items-start gap-2 rounded-md bg-saffron-50 px-3 py-2 text-sm text-ink-2"><MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-saffron-700" />Customer note: “{o.customer_note}”</p> : null}
        </section>

        <section className="rounded-lg border border-line bg-card p-4 shadow-card">
          <h2 className="mb-4 text-base font-bold text-ink">Timeline</h2>
          <OrderTimeline status={o.status} history={t.history} promisedAt={o.promised_at} />
        </section>
      </div>

      <aside className="space-y-3">
        <section className="rounded-lg border border-line bg-card p-4 text-sm shadow-card">
          <p className="flex items-center gap-2 font-bold text-ink"><MapPin className="h-4 w-4 text-info" />Customer</p>
          <p className="mt-1 text-sm font-semibold text-ink">{t.customer?.name ?? c.name}</p>
          <p className="text-xs text-ink-3">{c.line}{c.city ? `, ${c.city}` : ""}{c.pincode ? ` – ${c.pincode}` : ""}</p>
          {(t.customer?.phone ?? c.phone) ? <a href={`tel:${t.customer?.phone ?? c.phone}`} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-sm bg-brand-50 px-3 text-xs font-semibold text-brand-700"><Phone className="h-3.5 w-3.5" /> Call {t.customer?.phone ?? c.phone}</a> : null}
          {o.delivery_instructions ? <p className="mt-3 rounded-sm bg-surface px-2.5 py-2 text-xs text-ink-2"><Info className="mr-1 inline h-3 w-3" />Delivery note: “{o.delivery_instructions}”</p> : null}
          <p className="mt-3 text-xs text-ink-3">Placed {formatDateTime(o.created_at)}{o.promised_at && !terminal ? ` · promised by ${formatTime(o.promised_at)}` : ""}</p>
        </section>

        <section className="rounded-lg border border-line bg-card p-4 shadow-card">
          <h2 className="mb-3 text-base font-bold text-ink">Payment</h2>
          <div className="mb-3"><PaymentBadge method={o.payment_method} status={o.payment_status} size="sm" /></div>
          <KeyValue items={[
            { label: "Items", value: formatINR(o.subtotal) },
            ...(Number(o.coupon_discount) > 0 ? [{ label: `Coupon ${o.coupon_code ?? ""}`, value: `− ${formatINR(o.coupon_discount)}` }] : []),
            { label: "Delivery fee", value: Number(o.delivery_fee) ? formatINR(o.delivery_fee) : "FREE" }, { label: "Platform fee + GST", value: formatINR(Number(o.platform_fee) + Number(o.tax_amount), { precise: true }) },
            { label: "Customer pays", value: formatINR(o.total, { precise: true }), strong: true },
            { label: `Commission (${Number(o.commission_rate)}%)`, value: `− ${formatINR(o.commission_amount, { precise: true })}` },
            { label: "Your payout", value: formatINR(o.store_payout_amount, { precise: true }), strong: true },
          ]} />
          <p className="mt-3 text-xs text-ink-3">{PAYMENT_METHOD_LABEL[o.payment_method]} · {PAYMENT_STATUS_LABEL[o.payment_status]}{o.payment_method === "cod" ? " · rider collects cash at the door" : ""}</p>
        </section>

        {rider ? (
          <section className="rounded-lg border border-line bg-card p-4 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink"><Bike className="h-4 w-4 text-brand-600" /> Rider</h2>
            <div className="flex items-center gap-3">
              <Avatar name={rider.rider.name} src={rider.rider.avatar_url} size={44} />
              <div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">{rider.rider.name ?? "Delivery partner"}</p><p className="text-xs capitalize text-ink-3">{rider.rider.vehicle_type}{rider.rider.vehicle_number ? ` · ${rider.rider.vehicle_number}` : ""}</p><StarRating value={rider.rider.rating_avg} size={12} /></div>
              {rider.rider.phone ? <a href={`tel:${rider.rider.phone}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700" aria-label="Call rider"><Phone className="h-5 w-5" /></a> : null}
            </div>
            <p className="mt-3 text-xs text-ink-3">{rider.status === "accepted" ? "Heading to your store for pickup." : rider.status === "picked_up" ? `Picked up${rider.picked_up_at ? ` at ${formatTime(rider.picked_up_at)}` : ""} · on the way to the customer.` : rider.status === "delivered" ? `Delivered${rider.delivered_at ? ` at ${formatTime(rider.delivered_at)}` : ""}.` : rider.status}</p>
          </section>
        ) : o.status === "ready_for_pickup" ? (
          <section className="rounded-lg border border-dashed border-line-2 bg-surface p-4 text-sm text-ink-2"><Bike className="mb-1 h-5 w-5 text-ink-3" />Looking for a nearby rider. Keep the order packed and labelled with <strong>{o.order_number}</strong>.</section>
        ) : null}
      </aside>
    </div>
  );
}
