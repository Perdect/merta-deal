"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, XCircle, CheckCircle2, CreditCard, Clock } from "lucide-react";
import type { OrderTracking, TrackingLocation } from "@/types/app";
import { getOrderTrackingAction } from "@/lib/actions/tracking";
import { cancelOrderAction, completeOrderAction } from "@/lib/actions/account";
import { useOrderRealtime } from "@/hooks/use-order-realtime";
import { ORDER_STATUS_META, canCustomerCancel } from "@/lib/order-status";
import { CustomerOrderSteps } from "./order-status";
import { ReviewSheet } from "./review-sheet";
import { ReorderButton } from "./reorder-button";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { formatDate, formatDateTime, formatINR, formatTime } from "@/lib/utils";
import type { OrderStatus } from "@/lib/order-status";
import { DeliveryOtpStrip } from "./delivery-otp-strip";
import { UpiPayCard } from "./upi-pay-card";
import { useUpiDetails } from "@/hooks/use-upi-details";
import { PushOptInCard } from "@/components/pwa/push-opt-in-card";
import { OrderPlacedSplash } from "./order-placed-splash";
import { StatusHero } from "./tracking/status-hero";
import { TrackingMap, type MapStage } from "./tracking/tracking-map";
import { DeliveryDetailsCard, HelpCard, PartnerCard, PaymentCard, TRACK_CARD } from "./tracking/cards";
import { OrderSummaryCard } from "./tracking/order-summary-card";

const TERMINAL: OrderStatus[] = ["delivered", "completed", "cancelled", "rejected"];
/** Past this many minutes the header gives the promised time itself instead of a count of minutes. */
const COUNTDOWN_MAX_MIN = 90;

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

type Push = { configured: boolean; vapidPublicKey: string };

/**
 * The live half of the tracking screen: it holds the order, listens for changes and the rider's GPS
 * points, and hands everything to `TrackingScreen`, which only draws. Nothing here invents a value —
 * the rider's position is the last fix received, "live" is the Realtime channel's own state, and the
 * time of the last update is when a fetch last succeeded.
 */
export function OrderTrackingView({ initial, placed, paymentState, push, attention }: { initial: OrderTracking; placed?: boolean; paymentState?: string; /** Web-push availability (server-side check); the opt-in card shows after a fresh order. */ push?: Push; /** Something the customer has to answer (an item exception): shown straight under the header. */ attention?: React.ReactNode }) {
  const router = useRouter();
  const [t, setT] = React.useState(initial);
  const [trail, setTrail] = React.useState<{ lat: number; lng: number }[]>(initial.assignment?.last_location ? [{ lat: initial.assignment.last_location.lat, lng: initial.assignment.last_location.lng }] : []);
  const [rider, setRider] = React.useState<TrackingLocation | null>(initial.assignment?.last_location ?? null);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [seen, setSeen] = React.useState(initial);
  if (seen !== initial) { setSeen(initial); setT(initial); }
  // When a fetch last succeeded. The first render's data is the server's, so it starts at mount.
  const [syncedAt, setSyncedAt] = React.useState<number | null>(null);
  const [offline, setOffline] = React.useState(false);
  const refresh = React.useCallback(async () => {
    // A server action rejects outright when the phone is offline; the last good state stays on screen.
    try {
      const n = await getOrderTrackingAction(t.order.id);
      if (n) { setT(n); setSyncedAt(Date.now()); if (n.assignment?.last_location) setRider(n.assignment.last_location); }
    } catch { /* offline or a dropped request: the hero says the screen is not live */ }
  }, [t.order.id]);
  // Coming back to the tab (phones pause background pages): fetch the latest state at once.
  React.useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);
  React.useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    const t0 = setTimeout(() => { setSyncedAt(Date.now()); sync(); }, 0);
    window.addEventListener("online", sync); window.addEventListener("offline", sync);
    return () => { clearTimeout(t0); window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  // The page's clock: the countdown, the late notice and "updated … ago" on the map all read it.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);
  const connected = useOrderRealtime(t.order.id, t.assignment?.id ?? null, refresh, (loc) => { setRider(loc); setNow(Date.now()); setTrail((tr) => [...tr.slice(-200), { lat: loc.lat, lng: loc.lng }]); });
  const upi = useUpiDetails();
  const o = t.order;

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
    <>
      <TrackingScreen t={t} rider={rider} trail={trail} now={now} connected={connected} offline={offline} syncedAt={syncedAt} placed={placed} paymentState={paymentState} push={push} upi={upi} busy={busy} attention={attention}
        onChanged={refresh} onCancel={() => setCancelOpen(true)} onReview={() => setReviewOpen(true)} onComplete={complete} />
      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} tone="danger" title="Cancel this order?" description="You can cancel until your order is packed. Any payment made will be refunded to the original method." confirmLabel="Yes, cancel" loading={busy} onConfirm={() => cancel("Cancelled by customer")} />
      <ReviewSheet open={reviewOpen} onClose={() => setReviewOpen(false)} tracking={t} onDone={() => { refresh(); router.refresh(); }} />
    </>
  );
}

/**
 * The tracking screen itself, drawn from what it is given. On a phone it reads top to bottom: the green
 * header (what is happening, and when it should arrive), the map, the code the rider will ask for, how
 * the order is paid, who is bringing it, where it is going, help, and the order itself with its bill
 * and timeline. From `lg` up the header, map and timeline sit on the left and the cards on the right.
 *
 * The two column wrappers are `display: contents` below `lg`, so every block is a direct child of one
 * grid: that is what lets the header's bar stay at the top for the whole page.
 */
export function TrackingScreen({ t, rider, trail, now, connected, offline, syncedAt, placed, paymentState, push, upi, busy, attention, onChanged, onCancel, onReview, onComplete }: {
  t: OrderTracking; rider: TrackingLocation | null; trail: { lat: number; lng: number }[]; now: number;
  connected: boolean; offline: boolean; syncedAt: number | null;
  placed?: boolean; paymentState?: string; push?: Push; upi: ReturnType<typeof useUpiDetails>; busy: boolean; attention?: React.ReactNode;
  onChanged: () => void; onCancel: () => void; onReview: () => void; onComplete: () => void;
}) {
  const o = t.order; const meta = ORDER_STATUS_META[o.status];
  const live = Boolean(["rider_assigned", "out_for_delivery"].includes(o.status) && t.assignment && ["accepted", "picked_up"].includes(t.assignment.status));
  const paid = o.payment_method === "cod" || ["paid", "authorized"].includes(o.payment_status);
  const active = !TERMINAL.includes(o.status);
  const stopped = o.status === "cancelled" || o.status === "rejected";
  const done = o.status === "delivered" || o.status === "completed";
  // A direct UPI payment the customer still has to make; the admin confirms it, which confirms the order.
  const upiNow = t.payment?.provider === "upi" && o.payment_status === "pending" && o.status === "placed";
  const eta = o.promised_at ? Math.round((new Date(o.promised_at).getTime() - now) / 60000) : null;
  const late = active && paid && eta != null && eta < 0;
  const addr = o.address_snapshot as unknown as { full_name: string; phone: string; house: string; street: string; area: string; landmark?: string; city: string; pincode: string; lat?: number; lng?: number; label?: string | null };
  // The delivery pin: the one saved with the address, else the one the order itself recorded.
  const pin = addr.lat && addr.lng ? { lat: addr.lat, lng: addr.lng } : o.delivery_lat != null && o.delivery_lng != null ? { lat: o.delivery_lat, lng: o.delivery_lng } : null;

  // The header. A count of minutes appears only while the promised time is still ahead; when there is
  // no promise, it has passed, or the order is over, the headline is the status and nothing is guessed.
  const arriving = active && paid && eta != null && eta > 0;
  const hero = arriving
    ? eta <= COUNTDOWN_MAX_MIN
      ? { eyebrow: headline(o.status, paid), title: `Arriving in about ${eta} min`, note: `By ${formatTime(o.promised_at!)}` }
      : { eyebrow: headline(o.status, paid), title: `Arriving by ${formatTime(o.promised_at!)}`, note: formatDate(o.promised_at!, { weekday: "long", day: "numeric", month: "short" }) }
    : { eyebrow: undefined, title: headline(o.status, paid), note: done && o.delivered_at ? `${formatDateTime(o.delivered_at)} · ${meta.description}` : meta.description };

  // The map is on the screen for the whole life of an active order, from the moment it is placed.
  const stage: MapStage = o.status === "placed" ? "placed" : o.status === "confirmed" || o.status === "preparing" ? "packing" : "packed";
  const assigned = t.assignment && t.assignment.status !== "offered" ? t.assignment : null;
  const doing = !assigned ? null : live ? (assigned.status === "picked_up" ? "Bringing your order" : "Picking up your order") : assigned.status === "delivered" ? "Delivered this order" : null;
  const addressTitle = addr.label ? `${active ? "Delivering to" : done ? "Delivered to" : "Delivery address ·"} ${addr.label}` : done ? "Delivered to this address" : "Delivery address";

  const hasActions = t.can_review || o.status === "delivered" || !active || canCustomerCancel(o.status);
  const actions = hasActions ? (
    <div className="grid grid-cols-2 gap-2 [&>*:first-child:nth-last-child(odd)]:col-span-2" id="review">
      {t.can_review ? <Button variant="saffron" onClick={onReview}><Star className="h-4 w-4" /> Rate order</Button> : null}
      {o.status === "delivered" ? <Button variant="secondary" loading={busy} onClick={onComplete}><CheckCircle2 className="h-4 w-4" /> Mark received</Button> : null}
      {!active ? <ReorderButton orderId={o.id} size="md" variant="outline" /> : null}
      {canCustomerCancel(o.status) ? <Button variant="outline" onClick={onCancel} className="text-danger"><XCircle className="h-4 w-4" /> Cancel order</Button> : null}
    </div>
  ) : null;
  const COLUMN = "max-lg:contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4";

  return (
    <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:px-0 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-5">
      {placed && active ? <OrderPlacedSplash orderId={o.id} orderNumber={o.order_number} confirmed={paid && o.status !== "placed"} label={addr.label ?? null} addressLine={[addr.house, addr.street, addr.area, addr.city].filter(Boolean).join(", ")} etaLabel={o.promised_at ? formatTime(o.promised_at) : null} codNote={o.payment_method === "cod" ? `Keep ${formatINR(o.total, { precise: true })} cash ready for the rider` : null} /> : null}

      <div className={COLUMN}>
        <StatusHero status={o.status} eyebrow={hero.eyebrow} title={hero.title} note={hero.note} orderNumber={o.order_number} active={active} connected={connected} offline={offline} syncedAt={syncedAt} />

        {attention}

        {/* Once the order is over, what is left to do comes first: rate it, mark it received, buy again. */}
        {!active ? actions : null}

        {active ? (
          <TrackingMap
            store={t.pickup.lat != null && t.pickup.lng != null ? { lat: t.pickup.lat, lng: t.pickup.lng, name: t.pickup.name } : null}
            customer={pin} rider={live ? rider : null} trail={live ? trail : []} riderAssigned={live} stage={stage} now={now} offline={offline} />
        ) : null}

        {o.status === "out_for_delivery" ? <DeliveryOtpStrip otp={t.delivery_otp} locked={t.otp_locked} /> : null}

        {placed && o.status !== "placed" && active ? <Alert tone="success" className="rounded-lg" icon={<CheckCircle2 className="h-4 w-4" />} title={`Order ${o.order_number} confirmed`}>{t.pickup.name} is packing it now{o.promised_at ? `, arriving by ${formatTime(o.promised_at)}` : ""}.{o.payment_method === "cod" ? ` Keep ${formatINR(o.total, { precise: true })} cash ready for the rider.` : ""}</Alert> : null}
        {placed && o.status === "placed" && paid ? <Alert tone="success" className="rounded-lg" icon={<CheckCircle2 className="h-4 w-4" />} title={`Order ${o.order_number} placed`}>We&apos;ve got it and will confirm it as soon as your payment is received.</Alert> : null}
        {late ? (
          <Alert tone="warning" className="rounded-lg" icon={<Clock className="h-4 w-4" />} title={`Running ${Math.abs(eta!)} min late`}>
            {o.status === "ready_for_pickup" ? "Your order is packed and we're still finding a delivery partner." : o.status === "placed" ? "Your order hasn't been confirmed yet." : o.status === "out_for_delivery" || o.status === "rider_assigned" ? "Your delivery partner is taking longer than expected." : "The store is taking longer than usual to pack."} Sorry for the wait.
          </Alert>
        ) : null}
        {placed && active && push ? <PushOptInCard configured={push.configured} vapidPublicKey={push.vapidPublicKey} /> : null}

        {/* Beside the map on desktop; on phones the same timeline opens from the order summary. */}
        <section className={`${TRACK_CARD} hidden lg:block`} aria-labelledby="track-updates-wide">
          <h2 id="track-updates-wide" className="mb-4 font-display text-base font-bold text-ink">Order updates</h2>
          <CustomerOrderSteps status={o.status} history={t.history} promisedAt={active ? o.promised_at : null} paid={paid} />
        </section>
      </div>

      <div className={COLUMN}>
        {!upiNow && (paymentState === "pending" || (o.payment_status === "pending" && o.payment_method !== "cod")) ? <Alert tone="warning" className="rounded-lg" icon={<CreditCard className="h-4 w-4" />} title="Payment pending">Your order is saved but payment was not completed. Packing starts once payment is received. <Link href={`/checkout`} className="font-semibold underline">Retry from checkout</Link> or contact support.</Alert> : null}
        {paymentState === "setup" ? <Alert tone="warning" className="rounded-lg" title="Online payment unavailable">Razorpay is not configured on this deployment yet. Your order is saved with payment pending; please contact support or choose Cash on Delivery next time.</Alert> : null}
        {paymentState === "failed" ? <Alert tone="danger" className="rounded-lg" title="Payment failed">We could not verify the payment. If money was deducted it will be refunded automatically within 5–7 days.</Alert> : null}

        {/* How it is paid. A direct UPI payment still to be made keeps its own card: the QR, "I've paid", or cash instead. */}
        {upiNow && upi
          ? <UpiPayCard upi={upi} orderId={o.id} orderNumber={o.order_number} amount={Number(o.total)} claim={t.upi_claim ?? null} onChanged={onChanged} />
          : <PaymentCard total={Number(o.total)} method={o.payment_method} status={o.payment_status} active={active} stopped={stopped} refundDue={Boolean(t.payment?.refund_required && t.payment.status !== "refunded")} upi={upi} orderNumber={o.order_number} />}

        {assigned ? <PartnerCard rider={assigned.rider} doing={doing} callable={live} /> : active ? <PartnerCard rider={null} callable={false} packed={o.status === "ready_for_pickup"} /> : null}

        <DeliveryDetailsCard addressTitle={addressTitle}
          lines={[[addr.house, addr.street, addr.area].filter(Boolean).join(", "), [addr.landmark, [addr.city, addr.pincode].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")].filter(Boolean)}
          receiver={addr.full_name} phone={addr.phone} instructions={o.delivery_instructions} />

        <HelpCard orderId={o.id} pickup={t.pickup} />

        <OrderSummaryCard order={o} items={t.items} history={t.history} active={active} paid={paid} />

        {active ? actions : null}
      </div>
    </div>
  );
}
