"use client";
import * as React from "react";
import { AppBar } from "@/components/shop/app-bar";
import { BottomNav } from "@/components/shop/bottom-nav";
import { TrackingScreen } from "@/components/shop/order-tracking-view";
import type { OrderTracking, TrackingLocation } from "@/types/app";

const STORE = { lat: 26.6486, lng: 74.0334 };
const HOME = { lat: 26.6541, lng: 74.0412 };
const RIDER = { lat: 26.6512, lng: 74.0371 };

/** Fixture order for the preview route. None of this is shown anywhere outside development. */
function fixture(state: string, now: number): { t: OrderTracking; rider: TrackingLocation | null; connected: boolean; offline: boolean } {
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
  const status = state === "packing" ? "preparing" : state === "packed" ? "ready_for_pickup" : state === "picking-up" ? "rider_assigned" : state === "delivered" ? "delivered" : state === "cancelled" ? "cancelled" : "out_for_delivery";
  const hasRider = ["out_for_delivery", "rider_assigned", "delivered"].includes(status);
  const fix: TrackingLocation | null = !hasRider || state === "no-fix" || status === "delivered" ? null
    : { ...RIDER, heading: 40, speed_mps: 6, accuracy_m: 9, recorded_at: new Date(now - (state === "stale" ? 4 * 60_000 : 8_000)).toISOString() };
  const history = [
    { status: "placed", note: null, created_at: iso(24), actor_role: "customer" },
    { status: "confirmed", note: null, created_at: iso(22), actor_role: "admin" },
    ...(status !== "preparing" ? [{ status: "ready_for_pickup", note: null, created_at: iso(14), actor_role: "admin" }] : []),
    ...(hasRider ? [{ status: "rider_assigned", note: null, created_at: iso(11), actor_role: "rider" }] : []),
    ...(status === "out_for_delivery" || status === "delivered" ? [{ status: "out_for_delivery", note: null, created_at: iso(6), actor_role: "rider" }] : []),
    ...(status === "delivered" ? [{ status: "delivered", note: null, created_at: iso(1), actor_role: "rider" }] : []),
    ...(status === "cancelled" ? [{ status: "cancelled", note: "Cancelled by customer", created_at: iso(20), actor_role: "customer" }] : []),
  ];
  const t = {
    order: {
      id: "00000000-0000-4000-8000-000000000001", order_number: "MD2611001072", status, payment_method: "cod", payment_status: status === "delivered" ? "paid" : "cod_pending",
      subtotal: 1190, coupon_discount: 0, coupon_code: null, delivery_fee: 0, platform_fee: 0, tax_amount: 0, total: 1190, item_count: 2,
      promised_at: new Date(now + 12 * 60_000).toISOString(), created_at: iso(24), delivery_instructions: "Ring the bell twice",
      address_snapshot: { full_name: "Anita Sharma", phone: "9876543210", house: "12, First floor", street: "", area: "Sadar Bazaar", landmark: "opposite SBI", city: "Merta City", pincode: "341510", label: "Home", ...(state === "no-pin" ? {} : HOME) },
    },
    items: [
      { id: "i1", product_id: "p1", product_name: "Kaju Katli", pack_label: "1 kg", quantity: 1, unit_price: 790, line_total: 790, image_url: null, brand_name: null },
      { id: "i2", product_id: "p2", product_name: "Lal Mirch Powder", pack_label: "500 g", quantity: 2, unit_price: 200, line_total: 400, image_url: null, brand_name: null },
    ],
    history,
    pickup: { name: "Merta Deal", phone: "+918875020202", address_line1: "Gandhi Chowk", area: "Merta Central", ...(state === "no-pin" ? { lat: null, lng: null } : STORE) },
    payment: null, upi_claim: null,
    assignment: hasRider ? { id: "a1", status: status === "delivered" ? "delivered" : status === "out_for_delivery" ? "picked_up" : "accepted", accepted_at: iso(11), picked_up_at: iso(6), delivered_at: null, distance_km: 1.4, earning: null, cod_amount: 1190, expires_at: iso(-5), rider: { name: "Ramesh Kumar", phone: "9000000000", avatar_url: null, vehicle_type: "bike", vehicle_number: "RJ21 AB 1234", rating_avg: 4.8 }, last_location: fix } : null,
    customer: null, delivery_otp: status === "out_for_delivery" ? "4827" : null, otp_locked: state === "otp-locked", can_review: status === "delivered", reviews: [], viewer: "customer",
  } as unknown as OrderTracking;
  return { t, rider: fix, connected: state !== "offline" && state !== "reconnecting", offline: state === "offline" };
}

export function TrackPreview({ state }: { state: string }) {
  // The clock is read after mount so the server render and the first client render agree.
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => { const t = setTimeout(() => setNow(Date.now()), 0); return () => clearTimeout(t); }, []);
  if (now == null) return null;
  const f = fixture(state, now);
  const noop = () => {};
  return (
    <div className="mx-auto w-full max-w-6xl pb-24 pt-1 sm:px-6">
      <AppBar title="Track order" back="/" className="-mt-1" />
      <TrackingScreen t={f.t} rider={f.rider} trail={f.rider ? [STORE, { lat: 26.6497, lng: 74.0349 }, RIDER] : []} now={now} connected={f.connected} offline={f.offline} syncedAt={now - 90_000}
        upi={null} busy={false} onChanged={noop} onCancel={noop} onReview={noop} onComplete={noop} />
      <BottomNav />
    </div>
  );
}
