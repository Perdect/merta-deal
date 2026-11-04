"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, Store as StoreIcon, MapPin, Star, HelpCircle, XCircle, CheckCircle2, Wifi, WifiOff, CreditCard, Clock } from "lucide-react";
import type { OrderTracking, TrackingLocation } from "@/types/app";
import { getOrderTrackingAction } from "@/lib/actions/tracking";
import { cancelOrderAction, completeOrderAction } from "@/lib/actions/account";
import { useOrderRealtime } from "@/hooks/use-order-realtime";
import { ORDER_STATUS_META, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, canCustomerCancel } from "@/lib/order-status";
import { CustomerOrderSteps, OrderStatusBadge } from "./order-status";
import { LiveMap } from "./live-map";
import { ProductImage } from "./product-image";
import { ReviewSheet } from "./review-sheet";
import { ReorderButton } from "./reorder-button";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/states";
import { KeyValue, Avatar, StarRating } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { formatINR, formatDateTime, formatTime, cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/order-status";
import { DeliveryOtpStrip } from "./delivery-otp-strip";
import { PushOptInCard } from "@/components/pwa/push-opt-in-card";
import { OrderPlacedSplash } from "./order-placed-splash";

const TERMINAL: OrderStatus[] = ["delivered", "completed", "cancelled", "rejected"];

/** Shopper-facing headline for each status (quick-commerce wording; admin keeps the detailed labels). */
function headline(status: OrderStatus, paid: boolean) {
  switch (status) {
    case "placed": return paid ? "Confirming your order" : "Waiting for payment";
    case "confirmed": case "preparing": return "Packing your order";
    case "ready_for_pickup": return "Packed · finding a rider";
    case "rider_assigned": return "Rider is picking up your order";
    case "out_for_delivery": return "On the way";
    default: return ORDER_STATUS_META[status].label;
  }
}

export function OrderTrackingView({ initial, placed, paymentState, push }: { initial: OrderTracking; placed?: boolean; paymentState?: string; /** Web-push availability (server-side check); the opt-in card shows after a fresh order. */ push?: { configured: boolean; vapidPublicKey: string } }) {
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
  // Coming back to the tab (phones pause background pages): fetch the latest state at once.
  React.useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);
  // Minute clock for the countdown and the late notice.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const connected = useOrderRealtime(t.order.id, t.assignment?.id ?? null, refresh, (loc) => { setRider(loc); setTrail((tr) => [...tr.slice(-200), { lat: loc.lat, lng: loc.lng }]); });

  const o = t.order; const meta = ORDER_STATUS_META[o.status];
  const live = ["rider_assigned", "out_for_delivery"].includes(o.status) && t.assignment && ["accepted", "picked_up"].includes(t.assignment.status);
  const paid = o.payment_method === "cod" || ["paid", "authorized"].includes(o.payment_status);
  const active = !TERMINAL.includes(o.status);
  const eta = o.promised_at ? Math.round((new Date(o.promised_at).getTime() - now) / 60000) : null;
  const late = active && paid && eta != null && eta < 0;
  const addr = o.address_snapshot as unknown as { full_name: string; phone: string; house: string; street: string; area: string; landmark?: string; city: string; pincode: string; lat?: number; lng?: number; label?: string | null };

  // Server actions reject outright when the device is offline; the catch keeps the buttons usable
  // and tells the customer what happened instead of leaving a spinner.
  const cancel = async (reason: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await cancelOrderAction(o.id, reason);
      setCancelOpen(false);
      if (r.ok) { toast.success("Order cancelled"); refresh(); } else toast.error(r.error);
    } catch { toast.error("Could not cancel the order", "Check your connection and try again."); }
    finally { setBusy(false); }
  };
  const complete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await completeOrderAction(o.id);
      if (r.ok) { toast.success("Thanks for shopping local!"); refresh(); } else toast.error(r.error);
    } catch { toast.error("Could not update the order", "Check your connection and try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 gap-5 px-4 sm:px-0 lg:grid-cols-[minmax(0,1fr)_380px]">
      {placed && active ? <OrderPlacedSplash orderId={o.id} confirmed={paid && o.status !== "placed"} label={addr.label ?? null} addressLine={[addr.house, addr.street, addr.area, addr.city].filter(Boolean).join(", ")} codNote={o.payment_method === "cod" ? `Keep ${formatINR(o.total, { precise: true })} cash ready for the rider` : null} /> : null}
      <div className="space-y-4">
        {placed && o.status !== "placed" && active ? <Alert tone="success" icon={<CheckCircle2 className="h-4 w-4" />} title={`Order ${o.order_number} confirmed`}>{t.pickup.name} is packing it now{o.promised_at ? `, arriving by ${formatTime(o.promised_at)}` : ""}.{o.payment_method === "cod" ? ` Keep ${formatINR(o.total, { precise: true })} cash ready for the rider.` : ""}</Alert> : null}
        {placed && o.status === "placed" && paid ? <Alert tone="success" icon={<CheckCircle2 className="h-4 w-4" />} title={`Order ${o.order_number} placed`}>We&apos;ve got it and will confirm it as soon as your payment is received.</Alert> : null}
        {late ? (
          <Alert tone="warning" icon={<Clock className="h-4 w-4" />} title={`Running ${Math.abs(eta!)} min late`}>
            {o.status === "ready_for_pickup" ? "Your order is packed and we're still finding a delivery partner." : o.status === "placed" ? "Your order hasn't been confirmed yet." : o.status === "out_for_delivery" || o.status === "rider_assigned" ? "Your delivery partner is taking longer than expected." : "The store is taking longer than usual to pack."} Sorry for the wait.
            <span className="mt-2 flex flex-wrap gap-2">
              {t.pickup.phone ? <a href={`tel:${t.pickup.phone}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line-2 bg-card px-3 text-sm font-semibold text-ink"><Phone className="h-4 w-4" /> Call us</a> : null}
              <Link href={`/account/support?order=${o.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line-2 bg-card px-3 text-sm font-semibold text-ink"><HelpCircle className="h-4 w-4" /> Get help</Link>
              {canCustomerCancel(o.status) ? <button type="button" onClick={() => setCancelOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line-2 bg-card px-3 text-sm font-semibold text-danger"><XCircle className="h-4 w-4" /> Cancel order</button> : null}
            </span>
          </Alert>
        ) : null}
        {paymentState === "pending" || (o.payment_status === "pending" && o.payment_method !== "cod") ? <Alert tone="warning" icon={<CreditCard className="h-4 w-4" />} title="Payment pending">Your order is saved but payment was not completed. Packing starts once payment is received. <Link href={`/checkout`} className="font-semibold underline">Retry from checkout</Link> or contact support.</Alert> : null}
        {paymentState === "setup" ? <Alert tone="warning" title="Online payment unavailable">Razorpay is not configured on this deployment yet. Your order is saved with payment pending; please contact support or choose Cash on Delivery next time.</Alert> : null}
        {paymentState === "failed" ? <Alert tone="danger" title="Payment failed">We could not verify the payment. If money was deducted it will be refunded automatically within 5–7 days.</Alert> : null}
        {placed && active && push ? <PushOptInCard configured={push.configured} vapidPublicKey={push.vapidPublicKey} /> : null}

        <section className="rounded-lg border border-line bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            {/* Status changes arrive over Realtime; announce the new headline to screen readers. */}
            <div aria-live="polite" aria-atomic="true">
              <p className="text-xs text-ink-3">Order {o.order_number}</p>
              <h1 className="text-xl font-bold text-ink">{headline(o.status, paid)}</h1>
              <p className="text-sm text-ink-3">{active && paid && eta != null && eta > 0 ? `Arriving in about ${eta} min · by ${formatTime(o.promised_at!)}` : meta.description}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5"><OrderStatusBadge status={o.status} size="md" />{active ? <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", connected ? "text-success" : "text-ink-3")}>{connected ? <Wifi className="h-3 w-3" aria-hidden /> : <WifiOff className="h-3 w-3" aria-hidden />}{connected ? "Live updates" : "Reconnecting…"}</span> : null}</div>
          </div>
          {o.status === "out_for_delivery" ? <DeliveryOtpStrip otp={t.delivery_otp} locked={t.otp_locked} /> : null}
        </section>

        {live || o.status === "ready_for_pickup" ? (
          <section>
            <LiveMap store={{ lat: t.pickup.lat ?? 0, lng: t.pickup.lng ?? 0, name: t.pickup.name }} customer={addr.lat && addr.lng ? { lat: addr.lat, lng: addr.lng } : null} rider={live ? rider : null} trail={trail} showRoute={Boolean(live)} />
          </section>
        ) : null}

        {t.assignment && t.assignment.status !== "offered" ? (
          <section className="flex items-center gap-3 rounded-lg border border-line bg-card p-4">
            <Avatar name={t.assignment.rider.name} src={t.assignment.rider.avatar_url} size={44} />
            <div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">{t.assignment.rider.name ?? "Delivery partner"}</p><p className="text-xs text-ink-3 capitalize">{t.assignment.rider.vehicle_type}{t.assignment.rider.vehicle_number ? ` · ${t.assignment.rider.vehicle_number}` : ""}</p><StarRating value={t.assignment.rider.rating_avg} size={12} /></div>
            {t.assignment.rider.phone && live ? <a href={`tel:${t.assignment.rider.phone}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600" aria-label={`Call ${t.assignment.rider.name ?? "delivery partner"}`}><Phone className="h-5 w-5" aria-hidden /></a> : null}
          </section>
        ) : null}

        <section className="rounded-lg border border-line bg-card p-4">
          <h2 className="mb-4 text-base font-bold text-ink">Order status</h2>
          <CustomerOrderSteps status={o.status} history={t.history} promisedAt={active ? o.promised_at : null} paid={paid} />
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
          <p className="flex items-center gap-2 font-bold text-ink"><StoreIcon className="h-4 w-4 text-brand-600" />{t.pickup.name}</p><p className="mt-0.5 text-xs text-ink-3">{[t.pickup.address_line1, t.pickup.area].filter(Boolean).join(", ")}</p>
          {t.pickup.phone ? <a href={`tel:${t.pickup.phone}`} className="tap mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-brand-700"><Phone className="h-3 w-3" aria-hidden /> Call us</a> : null}
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

      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} tone="danger" title="Cancel this order?" description="You can cancel until your order is packed. Any payment made will be refunded to the original method." confirmLabel="Yes, cancel" loading={busy} onConfirm={() => cancel("Cancelled by customer")} />
      <ReviewSheet open={reviewOpen} onClose={() => setReviewOpen(false)} tracking={t} onDone={() => { refresh(); router.refresh(); }} />
    </div>
  );
}
