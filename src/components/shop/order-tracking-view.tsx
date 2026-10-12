"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, ShieldCheck, Store as StoreIcon, MapPin, Star, HelpCircle, XCircle, CheckCircle2, Wifi, WifiOff, CreditCard } from "lucide-react";
import type { OrderTracking, TrackingLocation } from "@/types/app";
import { getOrderTrackingAction } from "@/lib/actions/tracking";
import { cancelOrderAction, completeOrderAction } from "@/lib/actions/account";
import { useOrderRealtime } from "@/hooks/use-order-realtime";
import { ORDER_STATUS_META, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, canCustomerCancel } from "@/lib/order-status";
import { OrderTimeline, OrderStatusBadge } from "./order-status";
import { LiveMap } from "./live-map";
import { ProductImage } from "./product-image";
import { ReviewSheet } from "./review-sheet";
import { ReorderButton } from "./reorder-button";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/states";
import { KeyValue, Avatar, StarRating } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { formatINR, formatDateTime, minutesUntil, cn } from "@/lib/utils";

export function OrderTrackingView({ initial, placed, paymentState }: { initial: OrderTracking; placed?: boolean; paymentState?: string }) {
  const router = useRouter();
  const [t, setT] = React.useState(initial);
  const [trail, setTrail] = React.useState<{ lat: number; lng: number }[]>(initial.assignment?.last_location ? [{ lat: initial.assignment.last_location.lat, lng: initial.assignment.last_location.lng }] : []);
  const [rider, setRider] = React.useState<TrackingLocation | null>(initial.assignment?.last_location ?? null);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [seen, setSeen] = React.useState(initial);
  if (seen !== initial) { setSeen(initial); setT(initial); }
  const refresh = React.useCallback(async () => { const n = await getOrderTrackingAction(t.order.id); if (n) { setT(n); if (n.assignment?.last_location) setRider(n.assignment.last_location); } }, [t.order.id]);
  const connected = useOrderRealtime(t.order.id, t.assignment?.id ?? null, refresh, (loc) => { setRider(loc); setTrail((tr) => [...tr.slice(-200), { lat: loc.lat, lng: loc.lng }]); });

  const o = t.order; const meta = ORDER_STATUS_META[o.status];
  const live = ["rider_assigned", "out_for_delivery"].includes(o.status) && t.assignment && ["accepted", "picked_up"].includes(t.assignment.status);
  const eta = minutesUntil(o.promised_at);
  const addr = o.address_snapshot as unknown as { full_name: string; phone: string; house: string; street: string; area: string; landmark?: string; city: string; pincode: string; lat?: number; lng?: number };

  const cancel = async (reason: string) => { setBusy(true); const r = await cancelOrderAction(o.id, reason); setBusy(false); setCancelOpen(false); if (r.ok) { toast.success("Order cancelled"); refresh(); } else toast.error(r.error); };
  const complete = async () => { setBusy(true); const r = await completeOrderAction(o.id); setBusy(false); if (r.ok) { toast.success("Thanks for shopping local!"); refresh(); } else toast.error(r.error); };

  return (
    <div className="grid gap-5 px-4 sm:px-0 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {placed ? <Alert tone="success" icon={<CheckCircle2 className="h-4 w-4" />} title="Order placed!">{t.store.name} has been notified. {o.payment_method === "cod" ? "Keep cash ready for the rider." : ""}</Alert> : null}
        {paymentState === "pending" || (o.payment_status === "pending" && o.payment_method !== "cod") ? <Alert tone="warning" icon={<CreditCard className="h-4 w-4" />} title="Payment pending">Your order is saved but payment was not completed. The store will start packing once payment is received. <Link href={`/checkout`} className="font-semibold underline">Retry from checkout</Link> or contact support.</Alert> : null}
        {paymentState === "setup" ? <Alert tone="warning" title="Online payment unavailable">Razorpay is not configured on this deployment yet. Your order is saved with payment pending; please contact support or choose Cash on Delivery next time.</Alert> : null}
        {paymentState === "failed" ? <Alert tone="danger" title="Payment failed">We could not verify the payment. If money was deducted it will be refunded automatically within 5–7 days.</Alert> : null}

        <section className="rounded-lg border border-line bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-ink-3">Order {o.order_number}</p>
              <h1 className="text-xl font-bold text-ink">{meta.label}</h1>
              <p className="text-sm text-ink-3">{meta.description}{eta != null && eta > 0 && !["delivered", "completed", "cancelled", "rejected"].includes(o.status) ? ` · arriving in about ${eta} min` : ""}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5"><OrderStatusBadge status={o.status} size="md" /><span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold", connected ? "text-success" : "text-ink-4")}>{connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{connected ? "Live" : "Polling"}</span></div>
          </div>
          {t.delivery_otp && !["delivered", "completed", "cancelled", "rejected"].includes(o.status) ? (
            <div className="mt-4 flex items-center gap-3 rounded-md bg-saffron-50 p-3">
              <ShieldCheck className="h-6 w-6 text-saffron-700" />
              <div className="flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-saffron-700">Delivery OTP</p><p className="font-display text-2xl font-extrabold tracking-[0.3em] text-ink">{t.delivery_otp}</p><p className="text-xs text-ink-3">Share this with the rider only at handover.</p></div>
            </div>
          ) : null}
        </section>

        {live || o.status === "ready_for_pickup" ? (
          <section>
            <LiveMap store={{ lat: t.store.lat, lng: t.store.lng, name: t.store.name }} customer={addr.lat && addr.lng ? { lat: addr.lat, lng: addr.lng } : null} rider={live ? rider : null} trail={trail} showRoute={Boolean(live)} />
          </section>
        ) : null}

        {t.assignment && t.assignment.status !== "offered" ? (
          <section className="flex items-center gap-3 rounded-lg border border-line bg-card p-4">
            <Avatar name={t.assignment.rider.name} src={t.assignment.rider.avatar_url} size={44} />
            <div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">{t.assignment.rider.name ?? "Delivery partner"}</p><p className="text-xs text-ink-3 capitalize">{t.assignment.rider.vehicle_type}{t.assignment.rider.vehicle_number ? ` · ${t.assignment.rider.vehicle_number}` : ""}</p><StarRating value={t.assignment.rider.rating_avg} size={12} /></div>
            {t.assignment.rider.phone && live ? <a href={`tel:${t.assignment.rider.phone}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700" aria-label="Call rider"><Phone className="h-5 w-5" /></a> : null}
          </section>
        ) : null}

        <section className="rounded-lg border border-line bg-card p-4">
          <h2 className="mb-4 text-base font-bold text-ink">Order timeline</h2>
          <OrderTimeline status={o.status} history={t.history} promisedAt={o.promised_at} />
        </section>

        <section className="rounded-lg border border-line bg-card p-4">
          <h2 className="mb-3 text-base font-bold text-ink">Items ({o.item_count})</h2>
          <ul className="divide-y divide-line">{t.items.map((i) => <li key={i.id} className="flex items-center gap-3 py-2.5"><ProductImage image={i.image_url} brand={i.brand_name} productName={i.product_name} packSize={i.pack_label} className="h-12 w-12 rounded-sm" sizes="48px" /><span className="min-w-0 flex-1"><span className="line-clamp-1 text-sm font-medium text-ink">{i.product_name}</span><span className="text-xs text-ink-3">{i.pack_label} · {i.quantity} × {formatINR(i.unit_price)}</span></span><span className="text-sm font-bold tabular text-ink">{formatINR(i.line_total)}</span></li>)}</ul>
        </section>
      </div>

      <aside className="space-y-3">
        <section className="rounded-lg border border-line bg-card p-4">
          <h2 className="mb-3 text-base font-bold text-ink">Bill</h2>
          <KeyValue items={[
            { label: "Items", value: formatINR(o.subtotal) },
            ...(Number(o.coupon_discount) > 0 ? [{ label: `Coupon ${o.coupon_code}`, value: `− ${formatINR(o.coupon_discount)}` }] : []),
            { label: "Delivery", value: Number(o.delivery_fee) ? formatINR(o.delivery_fee) : "FREE" }, ...(Number(o.platform_fee) > 0 ? [{ label: "Platform fee", value: formatINR(o.platform_fee) }] : []), ...(Number(o.tax_amount) > 0 ? [{ label: "GST on fees", value: formatINR(o.tax_amount, { precise: true }) }] : []),
            { label: "Total", value: formatINR(o.total, { precise: true }), strong: true },
          ]} />
          <p className="mt-3 text-xs text-ink-3">{PAYMENT_METHOD_LABEL[o.payment_method]} · {PAYMENT_STATUS_LABEL[o.payment_status]}</p>
        </section>
        <section className="rounded-lg border border-line bg-card p-4 text-sm">
          <p className="flex items-center gap-2 font-bold text-ink"><StoreIcon className="h-4 w-4 text-brand-600" />{t.store.name}</p><p className="mt-0.5 text-xs text-ink-3">{t.store.address_line1}, {t.store.area}</p>
          <a href={`tel:${t.store.phone}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><Phone className="h-3 w-3" /> Call store</a>
          <p className="mt-3 flex items-center gap-2 font-bold text-ink"><MapPin className="h-4 w-4 text-info" />Deliver to</p><p className="mt-0.5 text-xs text-ink-3">{addr.full_name} · {addr.phone}<br />{[addr.house, addr.street, addr.area, addr.landmark, `${addr.city} – ${addr.pincode}`].filter(Boolean).join(", ")}</p>
          {o.delivery_instructions ? <p className="mt-2 rounded-sm bg-surface px-2 py-1.5 text-xs text-ink-2">“{o.delivery_instructions}”</p> : null}
          <p className="mt-3 text-xs text-ink-3">Placed {formatDateTime(o.created_at)}</p>
        </section>
        <div className="grid grid-cols-2 gap-2" id="review">
          {t.can_review ? <Button variant="saffron" onClick={() => setReviewOpen(true)}><Star className="h-4 w-4" /> Rate order</Button> : null}
          {o.status === "delivered" ? <Button variant="secondary" loading={busy} onClick={complete}><CheckCircle2 className="h-4 w-4" /> Mark received</Button> : null}
          {["delivered", "completed", "cancelled", "rejected"].includes(o.status) ? <ReorderButton orderId={o.id} size="md" variant="outline" /> : null}
          {canCustomerCancel(o.status) ? <Button variant="outline" onClick={() => setCancelOpen(true)} className="text-danger"><XCircle className="h-4 w-4" /> Cancel order</Button> : null}
          <Button variant="ghost" href={`/account/support?order=${o.id}`}><HelpCircle className="h-4 w-4" /> Need help?</Button>
        </div>
      </aside>

      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} tone="danger" title="Cancel this order?" description="You can cancel before the store starts packing. Any payment made will be refunded to the original method." confirmLabel="Yes, cancel" loading={busy} onConfirm={() => cancel("Cancelled by customer")} />
      <ReviewSheet open={reviewOpen} onClose={() => setReviewOpen(false)} tracking={t} onDone={() => { refresh(); router.refresh(); }} />
    </div>
  );
}
