"use client";
import * as React from "react";
import { PortalTheme } from "@/components/shared/portal-theme";
import { RiderShell } from "@/components/rider/rider-shell";
import { RiderFrame } from "@/components/rider/rider-frame";
import { RiderHome } from "@/components/rider/rider-home";
import { DeliveryComplete, type ActiveDeliveryDemo } from "@/components/rider/active-delivery";
import { DeliveryHistory } from "@/components/rider/delivery-history";
import { EarningsView } from "@/components/rider/earnings-view";
import { PayoutStatus, type EarningRow, type RiderPayoutRow } from "@/components/rider/payout-status";
import { RiderText } from "@/components/rider/rider-text";
import { StaffLogin } from "@/components/auth/staff-login";
import { RiderProfile } from "@/components/rider/rider-profile";
import { useRiderStore } from "@/components/rider/rider-store";
import { useRiderLang } from "@/lib/rider-i18n";
import type { RespondResult } from "@/lib/actions/rider";
import type { DeliveryPartner, Notification, RiderAssignment, RiderDeliveryCodeState, RiderStats } from "@/types/app";

/* Fixture data only. Nothing on this page reads or writes a real delivery: requests come from the list below,
   Accept / Decline answer from a stub that records the tap in `window.__riderDemo`, and the delivery steps send nothing. */

const riderBase = {
  id: "00000000-0000-4000-8000-00000000r1de", user_id: "00000000-0000-4000-8000-0000000000u1", status: "active", is_online: true, vehicle_type: "bike", vehicle_number: "RJ21AB1234", license_number: null, aadhaar_last4: "1234",
  emergency_contact: null, rating_avg: 4.8, rating_count: 12, total_deliveries: 57, total_earnings: 1420, current_lat: 26.6486, current_lng: 74.0334, city_id: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-11-13T00:00:00Z", last_seen_at: null,
} as unknown as DeliveryPartner;

const pickup = { name: "Merta Deal", phone: "+918875020202", address_line1: "Gandhi Chowk", area: "Merta Central", lat: 26.6486, lng: 74.0334 };
const fullAddress = { full_name: "Anita Sharma", phone: "9876543210", house: "12, First floor", street: "", area: "Sadar Bazaar", landmark: "SBI bank", city: "Merta City", pincode: "341510", lat: 26.652, lng: 74.04 };
const longAddress = { full_name: "Mohammed Irfan Qureshi", phone: "9828012345", house: "Plot 47-B, Second floor, above Shri Balaji Kirana Store", street: "Gali No. 3, behind Government Senior Secondary School", area: "Nai Abadi, Jodhpur Road Housing Board Colony", landmark: "the big water tank and Hanuman temple", city: "Merta City", pincode: "341510", lat: 26.6571, lng: 74.0452 };

const active = {
  id: "a1", status: "accepted", offered_at: "2026-11-23T09:00:00Z", expires_at: "2026-11-23T09:03:00Z", responded_at: "2026-11-23T09:01:00Z", picked_up_at: null, delivered_at: null,
  distance_km: 1.4, earning: 25, cod_amount: 790, pickup_lat: 26.6486, pickup_lng: 74.0334, drop_lat: 26.652, drop_lng: 74.04, arrived_pickup_at: null, arrived_customer_at: null, handover_method: null,
  order: { id: "o1", order_number: "MD2611001072", status: "rider_assigned", total: 790, item_count: 3, payment_method: "cod", delivery_instructions: "Ring the bell twice", address: fullAddress, promised_at: "2026-11-23T12:04:00Z", created_at: "2026-11-23T08:58:00Z" },
  pickup,
  items: [{ name: "Kaju Katli", quantity: 1, pack_label: "1 kg", eggless: false, cake_message: null }, { name: "Lal Mirch Powder", quantity: 2, pack_label: "500 g" }],
} as unknown as RiderAssignment;

/** An open request exactly as `rider_assignments()` sends one: area, city and pincode only, and the drop point rounded to three decimals. */
function offer(n: number, o: { area?: string; pin?: boolean; cod?: number; earning?: number; km?: number | null; items?: RiderAssignment["items"]; count?: number; minutesOld?: number }): RiderAssignment {
  const pin = o.pin !== false;
  const address: Record<string, string> = { city: "Merta City", pincode: "341510" };
  if (o.area !== undefined) address.area = o.area;
  return {
    ...active, id: `f${n}`, status: "offered", responded_at: null, distance_km: o.km === undefined ? 1.4 : o.km, earning: o.earning ?? 25, cod_amount: o.cod ?? 0,
    drop_lat: pin ? 26.652 : null, drop_lng: pin ? 74.04 : null,
    order: { ...active.order, id: `fo${n}`, order_number: `MD26110010${70 + n}`, status: "ready_for_pickup", item_count: o.count ?? (o.items ?? active.items).reduce((s, it) => s + it.quantity, 0), payment_method: (o.cod ?? 0) > 0 ? "cod" : "upi", delivery_instructions: null, address, created_at: new Date(Date.UTC(2026, 10, 23, 8, 0) - (o.minutesOld ?? 0) * 60_000 + n * 1000).toISOString() },
    items: o.items ?? active.items,
  } as unknown as RiderAssignment;
}
const OFFERS = {
  one: [offer(1, { area: "Sadar Bazaar", cod: 790 })],
  long: [offer(2, { area: "Nai Abadi, Jodhpur Road Housing Board Colony, behind Government Senior Secondary School", cod: 2365, earning: 40, km: 3.8, count: 9, items: [{ name: "Aashirvaad Shudh Chakki Atta", quantity: 2, pack_label: "10 kg" }, { name: "Fortune Kachi Ghani Mustard Oil", quantity: 3, pack_label: "1 L" }, { name: "Tata Salt", quantity: 2, pack_label: "1 kg" }, { name: "Amul Butter", quantity: 2, pack_label: "500 g" }] })],
  three: [offer(3, { area: "Sadar Bazaar", cod: 790 }), offer(4, { area: "Nehru Colony", earning: 30, km: 2.2 }), offer(5, { area: "Station Road", cod: 240, km: 0.9 })],
  six: [offer(3, { area: "Sadar Bazaar", cod: 790, minutesOld: 2900 }), offer(4, { area: "Nehru Colony", earning: 30, km: 2.2, minutesOld: 2700 }), offer(5, { area: "Station Road", cod: 240, km: 0.9, minutesOld: 1500 }), offer(6, { area: "Meera Nagar", cod: 1120, km: 1.8, minutesOld: 1400 }), offer(7, { area: "", cod: 365, km: 2.6, minutesOld: 90 }), offer(8, { area: "Bus Stand", earning: 0, km: null, pin: false, minutesOld: 5 })],
  pinOnly: [offer(7, { area: "", cod: 365, km: 2.6 })],
  noPin: [offer(8, { area: "Bus Stand", earning: 0, km: null, pin: false })],
} satisfies Record<string, RiderAssignment[]>;

const stats = (rider: DeliveryPartner, activeNow: number): RiderStats => ({ rider, today_deliveries: 3, today_earnings: 75, week_earnings: 410, cod_in_hand: 1240, cash_due: 1240, new_requests: 0, active: activeNow });
const history = [
  { ...active, id: "h1", status: "delivered", delivered_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), earning: 25, order: { ...active.order, order_number: "MD2611001069" } },
  { ...active, id: "h2", status: "delivered", delivered_at: new Date(Date.now() - 4 * 3_600_000).toISOString(), earning: 30, cod_amount: 0, order: { ...active.order, order_number: "MD2611001066", payment_method: "upi" } },
  { ...active, id: "h3", status: "expired", offered_at: new Date(Date.now() - 26 * 3_600_000).toISOString(), responded_at: null, earning: 25, order: { ...active.order, order_number: "MD2611001051" } },
  { ...active, id: "h4", status: "delivered", delivered_at: new Date(Date.now() - 27 * 3_600_000).toISOString(), earning: 35, distance_km: 3.1, order: { ...active.order, order_number: "MD2611001049" } },
] as RiderAssignment[];
const earnings: EarningRow[] = [
  { amount: 25, status: "pending", created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), confirmed_via: "otp", kind: "delivery", order: { order_number: "MD2611001069" } },
  { amount: 30, status: "paid", created_at: new Date(Date.now() - 4 * 3_600_000).toISOString(), confirmed_via: "otp", kind: "delivery", order: { order_number: "MD2611001066" } },
];
const payouts: RiderPayoutRow[] = [{ amount: 180, gross_amount: 420, cod_offset: 240, status: "paid", reference_no: "UTR4410", failure_reason: null, created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), settled_at: new Date(Date.now() - 3 * 86_400_000).toISOString() }];
const notifications = [
  { id: "n1", user_id: riderBase.user_id, type: "delivery_offer", title: "New delivery request", body: "Pickup from Merta Deal · 1.4 km · Earn ₹25", data: { order_id: "o1", order_number: "MD2611001072", offers: 3 }, is_read: false, created_at: new Date(Date.now() - 10 * 60_000).toISOString() },
  { id: "n2", user_id: riderBase.user_id, type: "delivery_cancelled", title: "Request closed", body: "", data: { order_id: "o9", order_number: "MD2611001060", reason: "taken" }, is_read: true, created_at: new Date(Date.now() - 3 * 3_600_000).toISOString() },
] as unknown as Notification[];

const code = (p: Partial<Omit<RiderDeliveryCodeState, "sms">> & { sms?: Partial<RiderDeliveryCodeState["sms"]> }): RiderDeliveryCodeState => ({
  applies: true, arrived: true, locked: false, attempts_left: 5, max_attempts: 5, expiry_minutes: 10, customer_has_code: false, ...p,
  sms: { status: "sent", at: new Date().toISOString(), phone_tail: "10", live: true, expires_at: null, ...p.sms },
  resend: { left: 2, max: 3, cooldown_seconds: 30, retry_in_seconds: 0, ...p.resend },
});

type Screen = { label: string; group: string; online?: boolean; status?: DeliveryPartner["status"]; offers?: RiderAssignment[]; active?: RiderAssignment; demo?: ActiveDeliveryDemo; page?: "home" | "done" | "history" | "earnings" | "profile" | "login" };
const atCustomer = { ...active, status: "picked_up", picked_up_at: "2026-11-23T09:20:00Z", arrived_pickup_at: "2026-11-23T09:10:00Z", arrived_customer_at: "2026-11-23T09:31:00Z", order: { ...active.order, status: "out_for_delivery" } } as RiderAssignment;
const SCREENS: Record<string, Screen> = {
  offline: { group: "Home", label: "Offline", online: false },
  waiting: { group: "Home", label: "Online, waiting" },
  pending: { group: "Home", label: "Account pending", status: "pending", online: false },
  "request-1": { group: "Requests", label: "One request", offers: OFFERS.one },
  "request-long": { group: "Requests", label: "Long area, many items", offers: OFFERS.long },
  "requests-3": { group: "Requests", label: "Three waiting", offers: OFFERS.three },
  "requests-6": { group: "Requests", label: "Six waiting (old orders)", offers: OFFERS.six },
  "request-pin-only": { group: "Requests", label: "No area written (pin only)", offers: OFFERS.pinOnly },
  "request-no-pin": { group: "Requests", label: "No map pin, earning not set", offers: OFFERS.noPin },
  "step-1": { group: "Delivery", label: "1 Go to the shop", active },
  "step-2": { group: "Delivery", label: "2 Collect the order", active: { ...active, arrived_pickup_at: "2026-11-23T09:10:00Z" } as RiderAssignment },
  "step-3": { group: "Delivery", label: "3 Go to the customer", active: { ...atCustomer, arrived_customer_at: null } as RiderAssignment },
  "step-3-long": { group: "Delivery", label: "3 Long address, prepaid", active: { ...atCustomer, arrived_customer_at: null, cod_amount: 0, order: { ...atCustomer.order, payment_method: "upi", address: longAddress, delivery_instructions: "Please call when you reach the school gate, the lane is narrow and the dog is loud." } } as unknown as RiderAssignment },
  "step-3-requests": { group: "Delivery", label: "3 With requests waiting", active: { ...atCustomer, arrived_customer_at: null } as RiderAssignment, offers: OFFERS.three },
  "code-sent": { group: "Code", label: "Code sent by SMS", active: atCustomer, demo: { code: code({}) } },
  "code-sending": { group: "Code", label: "Code being sent", active: atCustomer, demo: { code: code({ sms: { status: "pending", live: false, phone_tail: null } }) } },
  "code-not-sent": { group: "Code", label: "SMS not set up", active: atCustomer, demo: { code: code({ sms: { status: "unavailable", live: false, phone_tail: null }, customer_has_code: true }) } },
  "code-failed": { group: "Code", label: "SMS failed, resend wait", active: atCustomer, demo: { code: code({ sms: { status: "failed", live: false }, resend: { left: 2, max: 3, cooldown_seconds: 30, retry_in_seconds: 24 } }) } },
  "code-wrong": { group: "Code", label: "Wrong code, tries left", active: atCustomer, demo: { code: code({ attempts_left: 3 }), fail: { reason: "That code is not right.", code: "OTP_INCORRECT", attempts_left: 3 } } },
  "code-locked": { group: "Code", label: "Locked", active: atCustomer, demo: { code: code({ locked: true, attempts_left: 0 }), fail: { reason: "Too many wrong codes.", code: "OTP_LOCKED", attempts_left: 0, locked: true } } },
  "code-prepaid": { group: "Code", label: "Prepaid order", active: { ...atCustomer, cod_amount: 0, order: { ...atCustomer.order, payment_method: "upi" } } as unknown as RiderAssignment, demo: { code: code({}) } },
  "code-before-0059": { group: "Code", label: "No state from the server", active: atCustomer, demo: { code: null } },
  done: { group: "Delivery", label: "Delivered", page: "done" },
  history: { group: "Tabs", label: "Deliveries", page: "history" },
  earnings: { group: "Tabs", label: "Earnings", page: "earnings" },
  profile: { group: "Tabs", label: "Profile", page: "profile" },
  "profile-requests": { group: "Tabs", label: "Profile, requests waiting", page: "profile", offers: OFFERS.three },
  login: { group: "Tabs", label: "Sign in", page: "login" },
};
/** Height of the preview strip; the app starts below it. */
const PREVIEW_BAR = 30;
type DemoWindow = Window & { __riderDemo?: { answers: { id: string; accept: boolean }[] } };

/** Every rider screen with fixture data. `?state=<key>` opens one directly; the menu in the corner switches. */
export function RiderPreview({ still = true }: { still?: boolean }) {
  const [state, setState] = React.useState("waiting");
  const lang = useRiderLang((s) => s.lang);
  const setLang = useRiderLang((s) => s.setLang);
  const setGps = useRiderStore((s) => s.setGps);
  const setRealtime = useRiderStore((s) => s.setRealtime);
  React.useEffect(() => {
    const t = setTimeout(() => {
      const wanted = new URLSearchParams(window.location.search).get("state");
      if (wanted && SCREENS[wanted]) setState(wanted);
      setGps({ status: "watching", fix: { lat: 26.6441, lng: 74.0301, accuracy: 12, heading: null, speed: null, at: Date.now() }, lastSentAt: Date.now(), sendError: null, error: null }); setRealtime("live");
    }, 50);
    const keep = setInterval(() => setGps({ fix: { lat: 26.6441, lng: 74.0301, accuracy: 12, heading: null, speed: null, at: Date.now() - 3000 } }), 5000);
    return () => { clearTimeout(t); clearInterval(keep); };
  }, [setGps, setRealtime]);
  // The strip takes the place of the status bar: everything that respects the top safe area (the app bar, the sign-in hero, toasts) moves below it.
  React.useEffect(() => {
    const root = document.documentElement; const before = root.style.getPropertyValue("--safe-top");
    root.style.setProperty("--safe-top", `${PREVIEW_BAR}px`);
    return () => { if (before) root.style.setProperty("--safe-top", before); else root.style.removeProperty("--safe-top"); };
  }, []);
  const pick = (next: string) => { setState(next); window.history.replaceState(null, "", `?state=${next}`); };

  const sc = SCREENS[state] ?? SCREENS.waiting;
  const page = sc.page ?? "home";
  const rider = React.useMemo(() => ({ ...riderBase, is_online: sc.online !== false, status: sc.status ?? "active" }) as DeliveryPartner, [sc.online, sc.status]);
  const initial = React.useMemo(() => ({ stats: stats(rider, sc.active ? 1 : 0), offers: [], active: sc.active ? [sc.active] : [] }), [rider, sc.active]);
  // Requests behave as the server's do: each has a time limit, and one that runs out comes back as a new offer of the same order.
  const onHome = page === "home";
  const requests = React.useMemo(() => {
    let born = 0; const gone = new Set<string>(); const life = 150_000;
    return {
      home: onHome ? "/dev-preview/rider" : "/rider",
      source: async () => { born ||= Date.now(); const gen = Math.floor((Date.now() - born) / life); return { ok: true as const, data: (sc.offers ?? []).filter((o) => !gone.has(o.order.id)).map((o) => ({ ...o, id: `${o.id}-g${gen}`, offered_at: new Date(born + gen * life).toISOString(), expires_at: new Date(born + (gen + 1) * life).toISOString() })) }; },
      answer: async (id: string, accept: boolean): Promise<RespondResult> => {
        const w = window as DemoWindow; (w.__riderDemo ??= { answers: [] }).answers.push({ id, accept });
        await new Promise((r) => setTimeout(r, 700));
        const o = (sc.offers ?? []).find((x) => id.startsWith(`${x.id}-g`)); if (o) gone.add(o.order.id);
        return { ok: true, data: { status: accept ? "accepted" : "rejected", reassigned_to: null, already: false } };
      },
    };
  }, [sc.offers, onHome]);
  const push = { configured: false, vapidPublicKey: "" };
  const user = { id: rider.user_id, name: "Kayyum Khan", phone: "8875020202", email: "rider@example.com", avatarUrl: null };

  return (
    <div className="theme-rider contents">
      <PortalTheme portal="rider" />
      {still ? <style>{"*,*::before,*::after{animation:none!important;transition:none!important}"}</style> : null}
      {/* Preview-only controls sit in a dark strip where a phone's status bar would be, above the app (which is pushed
          down by the same height through --safe-top), so they can never cover an app control or be taken for one. */}
      <div className="fixed inset-x-0 top-0 z-[95] flex items-center gap-2 border-b border-dashed border-white/40 bg-[#1b1f24] px-2 font-mono text-[11px] text-white" style={{ height: PREVIEW_BAR }} data-preview-only>
        <span className="shrink-0 uppercase tracking-wide text-white/70">Preview · test data</span>
        <select aria-label="Preview screen" value={state} onChange={(e) => pick(e.target.value)} className="h-6 min-w-0 flex-1 rounded bg-white/15 px-1 text-[12px] text-white">
          {[...new Set(Object.values(SCREENS).map((s) => s.group))].map((g) => <optgroup key={g} label={g} className="text-ink">{Object.entries(SCREENS).filter(([, s]) => s.group === g).map(([k, s]) => <option key={k} value={k} className="text-ink">{s.label}</option>)}</optgroup>)}
        </select>
        <button type="button" onClick={() => setLang(lang === "hi" ? "en" : "hi", true)} className="h-6 shrink-0 rounded bg-white/15 px-2">{lang === "hi" ? "EN" : "हिं"}</button>
      </div>
      {page === "login" ? <RiderFrame><StaffLogin portal="rider" /></RiderFrame> : (
        <RiderShell key={state} user={user} rider={rider} initialActive={Boolean(sc.active)} initialLang="en" push={push} demo={requests}>
          {page === "history" ? <div><RiderText k="nav.deliveries" as="h1" /><DeliveryHistory items={history} /></div>
            : page === "earnings" ? <div><RiderText k="nav.earnings" as="h1" /><EarningsView delivered={history.filter((h) => h.status === "delivered")} rider={rider} /><div className="mt-4"><PayoutStatus earnings={earnings} payouts={payouts} /></div></div>
            : page === "profile" ? <RiderProfile user={user} rider={rider} notifications={notifications} push={push} />
            : page === "done" ? <DeliveryComplete completed={{ assignment: { ...atCustomer, status: "delivered" } as RiderAssignment, result: { ok: true, status: "delivered", reward_points: 0 } }} onDone={() => pick("waiting")} />
            : <RiderHome key={state} initial={initial} demo={sc.demo ?? {}} />}
        </RiderShell>
      )}
    </div>
  );
}
