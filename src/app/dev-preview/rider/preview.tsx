"use client";
import * as React from "react";
import { PortalTheme } from "@/components/shared/portal-theme";
import { RiderShell } from "@/components/rider/rider-shell";
import { RiderHome } from "@/components/rider/rider-home";
import { OfferAlertView } from "@/components/rider/offer-alert";
import { DeliveryHistory } from "@/components/rider/delivery-history";
import { StaffLogin } from "@/components/auth/staff-login";
import { RiderProfile } from "@/components/rider/rider-profile";
import { useRiderStore } from "@/components/rider/rider-store";
import { useNow } from "@/components/rider/use-now";
import { useRiderLang } from "@/lib/rider-i18n";
import type { DeliveryPartner, RiderAssignment, RiderStats } from "@/types/app";

const rider = {
  id: "00000000-0000-4000-8000-00000000r1de", user_id: "00000000-0000-4000-8000-0000000000u1", status: "active", is_online: true, vehicle_type: "bike", vehicle_number: "RJ21AB1234", license_number: null, aadhaar_last4: "1234",
  emergency_contact: null, rating_avg: 4.8, rating_count: 12, total_deliveries: 57, total_earnings: 1420, current_lat: 26.6486, current_lng: 74.0334, city_id: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-11-13T00:00:00Z", last_seen_at: null,
} as unknown as DeliveryPartner;

const base = {
  id: "a1", status: "accepted", offered_at: "2026-11-13T09:00:00Z", expires_at: new Date(Date.now() + 150_000).toISOString(), responded_at: "2026-11-13T09:01:00Z", picked_up_at: null, delivered_at: null,
  distance_km: 1.4, earning: 25, cod_amount: 790, pickup_lat: 26.6486, pickup_lng: 74.0334, drop_lat: 26.652, drop_lng: 74.04, arrived_pickup_at: null, arrived_customer_at: null, handover_method: null,
  order: { id: "o1", order_number: "MD2611001072", status: "rider_assigned", total: 790, item_count: 2, payment_method: "cod", delivery_instructions: "Ring the bell twice", address: { full_name: "Anita Sharma", phone: "9876543210", house: "12, First floor", street: "", area: "Sadar Bazaar", landmark: "opposite SBI", city: "Merta City", pincode: "341510", lat: 26.652, lng: 74.04 }, promised_at: new Date(Date.now() + 20 * 60_000).toISOString(), created_at: "2026-11-13T08:58:00Z" },
  pickup: { name: "Merta Deal", phone: "+918875020202", address_line1: "Gandhi Chowk", area: "Merta Central", lat: 26.6486, lng: 74.0334 },
  items: [{ name: "Kaju Katli", quantity: 1, pack_label: "1 kg", eggless: false, cake_message: null }, { name: "Lal Mirch Powder", quantity: 2, pack_label: "500 g" }],
} as unknown as RiderAssignment;

const stats: RiderStats = { rider, today_deliveries: 3, today_earnings: 75, week_earnings: 410, cod_in_hand: 1240, cash_due: 1240, new_requests: 0, active: 1 };
const history = [
  { ...base, id: "h1", status: "delivered", delivered_at: "2026-11-13T07:40:00Z", earning: 25, order: { ...base.order, order_number: "MD2611001069" } },
  { ...base, id: "h2", status: "delivered", delivered_at: "2026-11-13T06:10:00Z", earning: 30, cod_amount: 0, order: { ...base.order, order_number: "MD2611001066", payment_method: "upi" } },
  { ...base, id: "h3", status: "expired", offered_at: "2026-11-12T18:00:00Z", earning: 25, order: { ...base.order, order_number: "MD2611001051" } },
] as RiderAssignment[];

const ringer = { sound: "ready" as const, leader: true, muted: false, unlock: async () => true, claim: () => {} };

/** Toggle between "waiting", "active delivery" and "request popup" states; nothing here talks to the server on its own. */
export function RiderPreview() {
  const [state, setState] = React.useState<"waiting" | "active" | "offer" | "history" | "login" | "profile">("active");
  const [collapsed, setCollapsed] = React.useState(false);
  const now = useNow();
  const lang = useRiderLang((s) => s.lang);
  const setLang = useRiderLang((s) => s.setLang);
  const setGps = useRiderStore((s) => s.setGps);
  const setRealtime = useRiderStore((s) => s.setRealtime);
  React.useEffect(() => {
    const t = setTimeout(() => { setGps({ status: "watching", fix: { lat: 26.6486, lng: 74.0334, accuracy: 12, heading: null, speed: null, at: Date.now() - 4000 }, lastSentAt: Date.now() - 4000, sendError: null, error: null }); setRealtime("live"); }, 50);
    return () => clearTimeout(t);
  }, [setGps, setRealtime]);
  const initial = { stats, offers: [], active: state === "active" ? [base] : [] };
  return (
    <div className="theme-rider contents">
      <PortalTheme portal="rider" />
      <div className="fixed left-2 top-2 z-[80] flex gap-1 rounded-md bg-ink/80 p-1 text-[11px] text-white">
        {(["waiting", "active", "offer", "history", "login", "profile"] as const).map((s) => <button key={s} type="button" onClick={() => setState(s)} className={`rounded px-2 py-1 ${state === s ? "bg-white text-ink" : ""}`}>{s}</button>)}
        <button type="button" onClick={() => setLang(lang === "hi" ? "en" : "hi", true)} className="rounded bg-brand-600 px-2 py-1">{lang === "hi" ? "EN" : "हिं"}</button>
      </div>
      {state === "login" ? <StaffLogin portal="rider" /> : (
      <RiderShell user={{ id: rider.user_id, name: "Kayyum Khan" }} rider={rider} initialActive={state === "active"} initialLang="en" push={{ configured: false, vapidPublicKey: "" }}>
        {state === "history" ? <DeliveryHistory items={history} /> : state === "profile" ? <RiderProfile user={{ id: rider.user_id, name: "Kayyum Khan", phone: "8875020202", email: "rider@example.com", avatarUrl: null }} rider={rider} notifications={[]} push={{ configured: false, vapidPublicKey: "" }} /> : <RiderHome key={state} initial={initial} />}
      </RiderShell>)}
      {state === "offer" ? <OfferAlertView collapsed={collapsed} setCollapsed={setCollapsed} live={[{ ...base, status: "offered" } as RiderAssignment]} o={{ ...base, status: "offered" } as RiderAssignment} now={now} msLeft={125_000} urgent={false} customerArea="Sadar Bazaar" cod earns km muted={false} ringing ringer={ringer} busy={null} respond={async () => {}} confirmReject={false} setConfirmReject={() => {}} snooze={() => {}} /> : null}
    </div>
  );
}
