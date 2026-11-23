"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellRing, MapPin, Package, Store as StoreIcon, Timer, Banknote, VolumeX, Volume2, IndianRupee, ChevronRight, Map as MapIcon } from "lucide-react";
import type { RiderAssignment } from "@/types/app";
import { getRiderAssignmentsAction, respondAssignmentAction, type RespondResult } from "@/lib/actions/rider";
import { deliverPendingPushAction } from "@/lib/actions/alerts";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useRinger } from "@/lib/alerts/use-ringer";
import type { PushConfig } from "@/components/alerts/alert-setup";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { useRiderStore, GPS_STALE_MS } from "./rider-store";
import { useNow } from "./use-now";
import { formatKm, mapPointUrl, mmss, requestDestination } from "./rider-utils";
import { cn, formatINR, haversineKm } from "@/lib/utils";
import { useT } from "@/lib/rider-i18n";

/** How long the phone rings the first time it sees an order. After that the request waits in the list, silently. */
export const RING_MS = 30_000;
/** An order that is offered again gets one short tone, and not more often than this. */
const REMIND_GAP_MS = 120_000;
/** A card stays for a moment after its time runs out, while the server is asked whether the order is offered again. */
const GRACE_MS = 5_000;

const SEEN_KEY = "md-rider-seen-orders";
const SEEN_KEEP_MS = 48 * 3_600_000;
/** Orders this phone has already rung for, with when; kept for two days so a reload or a re-offer never rings twice. */
function readSeen(): Map<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>;
    const cutoff = Date.now() - SEEN_KEEP_MS;
    return new Map(Object.entries(raw).filter(([, at]) => typeof at === "number" && at > cutoff));
  } catch { return new Map(); }
}
function writeSeen(seen: Map<string, number>) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries([...seen].slice(-200)))); } catch { /* private mode: it rings again after a reload, nothing else */ } }
const expiry = (o: RiderAssignment) => new Date(o.expires_at).getTime();
/** Vibrates when the phone can. Browsers refuse (and log) a vibration before the first tap on the page, so it is not asked for then. */
const vibrate = (pattern: number | number[]) => {
  try {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation && !activation.hasBeenActive) return;
    navigator.vibrate(pattern);
  } catch { /* unsupported */ }
};

type Sound = { state: ReturnType<typeof useRinger>["sound"]; leader: boolean; muted: boolean };
type Requests = {
  /** Requests to show, oldest order first: the open ones, plus one whose time has just run out while the server is asked again. */
  shown: RiderAssignment[];
  /** How many of them can still be answered. */
  open: number;
  loaded: boolean;
  /** The phone is ringing for a new request right now. */
  ringing: boolean;
  sound: Sound;
  busy: { id: string; kind: "accept" | "reject" } | null;
  /** The request whose Decline has been tapped once and is waiting for the second tap. */
  armed: string | null;
  now: number;
  accept: (o: RiderAssignment) => void;
  decline: (o: RiderAssignment) => void;
  stopRinging: () => void;
  setMuted: (v: boolean) => void;
  unlock: () => void;
  claim: () => void;
};
const RequestsContext = React.createContext<Requests | null>(null);
const NONE: Requests = { shown: [], open: 0, loaded: false, ringing: false, sound: { state: "unknown", leader: true, muted: false }, busy: null, armed: null, now: 0, accept: () => {}, decline: () => {}, stopRinging: () => {}, setMuted: () => {}, unlock: () => {}, claim: () => {} };
/** The rider's open delivery requests, as the shell holds them. Empty outside the shell. */
export function useRequests(): Requests { return React.useContext(RequestsContext) ?? NONE; }

type Source = () => Promise<{ ok: true; data: RiderAssignment[] } | { ok: false; error: string }>;
type Answer = (assignmentId: string, accept: boolean) => Promise<RespondResult>;
const fromServer: Source = () => getRiderAssignmentsAction(["offered"]);

/**
 * Holds the rider's open delivery requests for every page of the app. They come from the server
 * (`rider_assignments`, which also expires stale ones), re-read on every Realtime change to this rider's
 * assignments, after a reconnect or a return to the foreground, and on a slow timer (fast only while
 * Realtime is down). The home screen lists them; other tabs get a strip that leads there.
 *
 * Ringing: the phone rings once for an order it has not seen before, for at most `RING_MS`, and stops as
 * soon as the rider answers it or taps Stop. An order that is offered again (the server re-offers a packed
 * order every few minutes until someone takes it) does not ring a second time: it gets one short tone and
 * waits in the list. Mute silences everything. Accept and Decline report only what the database answered.
 *
 * `source`, `answer` and `home` exist so the development preview can show fixture requests; the app never passes them.
 */
export function RequestsProvider({ push, enabled, children, source = fromServer, answer = respondAssignmentAction, home = "/rider" }: { push: PushConfig; enabled: boolean; children: React.ReactNode; source?: Source; answer?: Answer; /** Where the request list is shown (the preview's own address in development). */ home?: string }) {
  const { t } = useT();
  const router = useRouter();
  const ringer = useRinger();
  const { setRinging, courier, ping } = ringer;
  const now = useNow();
  const version = useRiderStore((s) => s.assignmentsVersion);
  const realtime = useRiderStore((s) => s.realtime);
  const bump = useRiderStore((s) => s.bumpAssignments);
  const onDelivery = useRiderStore((s) => s.activeDelivery);
  const isOnline = useRiderStore((s) => s.isOnline);
  const [offers, setOffers] = React.useState<RiderAssignment[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [ring, setRing] = React.useState<Record<string, number>>({});
  const [busy, setBusy] = React.useState<Requests["busy"]>(null);
  const [armed, setArmed] = React.useState<string | null>(null);
  const seenRef = React.useRef<Map<string, number> | null>(null);
  const knownRef = React.useRef<Set<string>>(new Set());
  const loadedOnce = React.useRef(false);
  const remindedAt = React.useRef(0);
  const pingRef = React.useRef(ping);
  React.useEffect(() => { pingRef.current = ping; }, [ping]);

  const load = React.useCallback(async () => {
    try {
      const r = await source();
      if (!r.ok) return;
      setOffers(r.data); setLoaded(true);
      const first = !loadedOnce.current; loadedOnce.current = true;
      const added = r.data.filter((o) => !knownRef.current.has(o.id));
      if (!added.length) return;
      added.forEach((o) => knownRef.current.add(o.id));
      const seen = (seenRef.current ??= readSeen());
      const at = Date.now();
      const fresh = added.filter((o) => !seen.has(o.order.id));
      const busyNow = useRiderStore.getState().activeDelivery;
      if (fresh.length) {
        fresh.forEach((o) => seen.set(o.order.id, at)); writeSeen(seen);
        setRing((cur) => ({ ...cur, ...Object.fromEntries(fresh.map((o) => [o.order.id, at + RING_MS])) }));
        if (!busyNow) vibrate([300, 120, 300]);
      } else if (!first && !busyNow && at - remindedAt.current > REMIND_GAP_MS) {
        // The same order, offered again: one short tone, never a second ring.
        remindedAt.current = at; pingRef.current(); vibrate(150);
      }
      if (push.configured && courier) void deliverPendingPushAction();
    } catch { /* offline: the next bump or poll retries */ }
  }, [source, push.configured, courier]);

  React.useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(load, 0);
    const id = setInterval(load, realtime === "live" ? 90_000 : 20_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load, enabled, realtime]);
  const firstRef = React.useRef(true);
  React.useEffect(() => { if (firstRef.current) { firstRef.current = false; return; } if (!enabled) return; const tm = setTimeout(load, 0); return () => clearTimeout(tm); }, [version, load, enabled]);

  const shown = React.useMemo(() => (now && enabled ? offers.filter((o) => now < expiry(o) + GRACE_MS) : [])
    .sort((a, b) => (a.order.created_at === b.order.created_at ? a.order.order_number.localeCompare(b.order.order_number) : a.order.created_at < b.order.created_at ? -1 : 1)), [offers, now, enabled]);
  const openList = shown.filter((o) => now < expiry(o));
  const open = openList.length;
  const ringing = !onDelivery && isOnline && openList.some((o) => (ring[o.order.id] ?? 0) > now);
  React.useEffect(() => { setRinging(ringing); }, [ringing, setRinging]);
  React.useEffect(() => () => setRinging(false), [setRinging]);
  // A request whose time has run out is asked about once more: the server records the expiry and, if the order is still waiting, offers it again.
  const expiredCount = now ? offers.filter((o) => now >= expiry(o)).length : 0;
  React.useEffect(() => { if (expiredCount > 0) { const tm = setTimeout(load, 800); return () => clearTimeout(tm); } }, [expiredCount, load]);

  // An armed Decline goes back to normal if it is not confirmed within a few seconds.
  React.useEffect(() => { if (!armed) return; const tm = setTimeout(() => setArmed(null), 4000); return () => clearTimeout(tm); }, [armed]);

  const busyRef = React.useRef(false);
  const respond = React.useCallback(async (offer: RiderAssignment, accept: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy({ id: offer.id, kind: accept ? "accept" : "reject" });
    setRing((cur) => { const next = { ...cur }; delete next[offer.order.id]; return next; });
    try {
      const r = await answer(offer.id, accept);
      setArmed(null);
      if (!r.ok) {
        if ("outcome" in r) {
          if (r.outcome === "taken") toast.warning(t("offer.takenTitle"), t("offer.takenBody"));
          else if (r.outcome === "expired") toast.warning(t("offer.expiredTitle"), t("offer.expiredBody"));
          else toast.info(t("offer.goneTitle"), r.error);
        } else toast.error(t("offer.sendFailed"), r.error);
        setOffers((cur) => cur.filter((x) => x.id !== offer.id));
        bump(); router.refresh();
        return;
      }
      if (accept) toast.success(r.data.already ? t("offer.alreadyYours") : t("offer.accepted"), t("offer.headTo", { name: offer.pickup.name }));
      else toast.info(t("offer.declined"), t("offer.declinedBody"));
      setOffers((cur) => cur.filter((x) => x.id !== offer.id));
      bump(); router.refresh();
    } catch { toast.error(t("offer.noConnectionTitle"), t("offer.noConnectionBody")); }
    finally { busyRef.current = false; setBusy(null); }
  }, [answer, bump, router, t]);

  const accept = React.useCallback((o: RiderAssignment) => { void respond(o, true); }, [respond]);
  // Decline is two taps on the same button: the first arms it for a few seconds, the second sends it. (It once opened a
  // confirm dialog that was drawn behind the request, so Decline appeared to do nothing and no decline was ever recorded.)
  const decline = React.useCallback((o: RiderAssignment) => { if (armed === o.id) void respond(o, false); else setArmed(o.id); }, [armed, respond]);
  const stopRinging = React.useCallback(() => setRing({}), []);
  const { setMuted, unlock: unlockSound, claim, sound: soundState, leader, muted } = ringer;
  const unlock = React.useCallback(() => { void unlockSound(); }, [unlockSound]);

  const value = React.useMemo<Requests>(() => ({ shown, open, loaded, ringing, sound: { state: soundState, leader, muted }, busy, armed, now, accept, decline, stopRinging, setMuted, unlock, claim }),
    [shown, open, loaded, ringing, soundState, leader, muted, busy, armed, now, accept, decline, stopRinging, setMuted, unlock, claim]);

  return <RequestsContext.Provider value={value}>{children}{enabled ? <RequestStrip home={home} /> : null}</RequestsContext.Provider>;
}

/** On the other tabs: a bar above the tab bar saying requests are waiting, which leads to the home screen where they are listed. */
function RequestStrip({ home }: { home: string }) {
  const { t } = useT();
  const pathname = usePathname();
  const { open, ringing } = useRequests();
  const onDelivery = useRiderStore((s) => s.activeDelivery);
  const isOnline = useRiderStore((s) => s.isOnline);
  const keyboard = useKeyboardOpen();
  if (pathname === home || open === 0 || onDelivery || !isOnline || keyboard) return null;
  return (
    <Link href="/rider" className="fixed inset-x-3 z-[45] mx-auto flex min-h-14 max-w-lg items-center gap-3 rounded-2xl bg-brand-700 px-4 py-2.5 text-white shadow-float motion-safe:animate-slide-up" style={{ bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 10px)" }}>
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
        {ringing ? <span className="absolute inset-0 rounded-full bg-white/30 motion-safe:animate-ping" aria-hidden /> : null}
        <BellRing className="relative h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-[16px] font-bold leading-tight">{open === 1 ? t("req.titleOne") : t("req.titleMany", { n: open })}</span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-[15px] font-bold">{t("req.see")}<ChevronRight className="h-5 w-5" aria-hidden /></span>
    </Link>
  );
}

/** The home screen's list of open requests: a heading that says how many, the sound line, then one card each. */
export function RequestList() {
  const { t } = useT();
  const r = useRequests();
  const fix = useRiderStore((s) => s.gps.fix);
  if (!r.shown.length) return null;
  const near = fix && r.now && r.now - fix.at < GPS_STALE_MS ? { lat: fix.lat, lng: fix.lng } : null;
  const many = r.shown.length > 1;
  const pickupOf = (o: RiderAssignment) => ({ name: o.pickup.name, line: [o.pickup.address_line1, o.pickup.area].filter(Boolean).join(", ") });
  const firstPickup = pickupOf(r.shown[0]!);
  const shared = many && r.shown.every((o) => { const p = pickupOf(o); return p.name === firstPickup.name && p.line === firstPickup.line; }) ? firstPickup : null;
  const quiet = r.sound.state === "ready" && r.sound.leader && !r.sound.muted && !r.ringing;
  return (
    <section aria-labelledby="req-title" className="space-y-3">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 id="req-title" className="font-display text-[22px] font-extrabold leading-tight text-ink" aria-live="polite">{many ? t("req.titleMany", { n: r.shown.length }) : t("req.titleOne")}</h2>
          {many ? <p className="mt-0.5 text-[15px] text-ink-2">{t("req.hintMany")}</p> : null}
        </div>
        {/* Sound is on and nothing is ringing: the only thing left to offer is Mute, as one small button. */}
        {quiet ? <button type="button" onClick={() => r.setMuted(true)} className="tap -mt-1 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[14px] font-bold text-ink-2"><Volume2 className="h-4 w-4 text-brand-700" aria-hidden />{t("req.mute")}</button> : null}
      </div>
      {quiet ? null : <SoundLine />}
      {/* Several requests from the same shop: the shop and the note about the address are said once, not on every card. */}
      {shared ? (
        <div className="rounded-2xl bg-surface-2 px-4 py-3">
          <p className="flex items-start gap-2.5 text-[15px] leading-snug text-ink-2"><StoreIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden /><span className="min-w-0 break-words">{t("req.pickup")}: <span className="font-bold text-ink">{shared.name}</span>{shared.line ? `, ${shared.line}` : ""}</span></p>
          <p className="mt-1.5 pl-[30px] text-[13px] leading-snug text-ink-3">{t("req.afterAccept")}</p>
        </div>
      ) : null}
      <ul className="space-y-3">
        {r.shown.map((o) => (
          <li key={o.order.id}>
            <RequestCard o={o} now={r.now} busy={r.busy?.id === o.id ? r.busy.kind : null} locked={r.busy !== null} armed={r.armed === o.id} from={near} compact={Boolean(shared)} onAccept={() => r.accept(o)} onDecline={() => r.decline(o)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Where the sound stands when it needs a word, in one line with one button: ringing (Stop), sound off (Turn on), muted (Unmute), another tab (Ring here). */
export function SoundLine() {
  const { t } = useT();
  const { ringing, sound, stopRinging, setMuted, unlock, claim } = useRequests();
  if (!ringing && sound.state === "ready" && sound.leader && !sound.muted) return null;
  const row = "flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3.5 py-2 text-[15px] font-semibold";
  const btn = "tap inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[15px] font-bold";
  if (sound.state === "unknown") return null;
  if (sound.state === "unsupported") return <p className={cn(row, "bg-surface-2 text-ink-2")}><span className="flex items-center gap-2"><VolumeX className="h-5 w-5 shrink-0" aria-hidden />{t("req.noSound")}</span></p>;
  if (sound.state === "locked") return (
    <div className={cn(row, "bg-warning-50 text-ink")}>
      <span className="flex min-w-0 items-center gap-2"><VolumeX className="h-5 w-5 shrink-0 text-[#8a6300]" aria-hidden />{t("req.soundOff")}</span>
      <button type="button" onClick={unlock} className={cn(btn, "bg-card text-ink shadow-sm")}>{t("req.turnSoundOn")}</button>
    </div>
  );
  if (sound.muted) return (
    <div className={cn(row, "bg-warning-50 text-ink")}>
      <span className="flex min-w-0 items-center gap-2"><VolumeX className="h-5 w-5 shrink-0 text-[#8a6300]" aria-hidden />{t("req.muted")}</span>
      <button type="button" onClick={() => setMuted(false)} className={cn(btn, "bg-card text-ink shadow-sm")}><Volume2 className="h-4 w-4" aria-hidden />{t("req.unmute")}</button>
    </div>
  );
  if (!sound.leader) return (
    <div className={cn(row, "bg-surface-2 text-ink-2")}>
      <span className="flex min-w-0 items-center gap-2"><Volume2 className="h-5 w-5 shrink-0" aria-hidden />{t("req.otherTab")}</span>
      <button type="button" onClick={claim} className={cn(btn, "bg-card text-ink shadow-sm")}>{t("req.ringHere")}</button>
    </div>
  );
  if (ringing) return (
    <div className={cn(row, "bg-brand-50 text-brand-800")} role="status">
      <span className="flex min-w-0 items-center gap-2"><BellRing className="h-5 w-5 shrink-0 motion-safe:animate-pulse-soft" aria-hidden />{t("req.ringing")}</span>
      <button type="button" onClick={stopRinging} className={cn(btn, "bg-card text-ink shadow-sm")}><VolumeX className="h-4 w-4" aria-hidden />{t("req.stopRinging")}</button>
    </div>
  );
  return null;
}

export type RequestCardProps = {
  o: RiderAssignment; now: number;
  /** This card's own answer is on its way to the server. */
  busy: "accept" | "reject" | null;
  /** Another card's answer is on its way: nothing else can be tapped until it is back. */
  locked: boolean;
  /** Decline has been tapped once. */
  armed: boolean;
  /** The rider's own fresh GPS fix, when there is one: used only for the straight-line distance to the shop. */
  from: { lat: number; lng: number } | null;
  /** One of several from the same shop: the list has already named the shop and said when the full address shows. */
  compact?: boolean;
  onAccept: () => void; onDecline: () => void;
};

/**
 * One delivery request, free of data fetching so it can be drawn with fixture data. Everything on it is what
 * the server sent for an open request: the order number, the pickup point, the area / city / pincode of the
 * address and its drop point rounded to about 100 m, the straight-line distance, the items, the cash to
 * collect and the earning. The house, the customer's name and the phone are not sent until it is accepted,
 * and the card says so.
 */
export function RequestCard({ o, now, busy, locked, armed, from, compact = false, onAccept, onDecline }: RequestCardProps) {
  const { t } = useT();
  const msLeft = now ? expiry(o) - now : 0;
  const over = Boolean(now) && msLeft <= 0;
  const urgent = msLeft > 0 && msLeft < 30_000;
  const dest = requestDestination(o);
  const cod = o.order.payment_method === "cod" && Number(o.cod_amount) > 0;
  const earns = Number(o.earning) > 0;
  const km = o.distance_km != null && Number(o.distance_km) > 0 ? formatKm(Number(o.distance_km)) : null;
  const toShop = from && Number.isFinite(o.pickup.lat) && Number.isFinite(o.pickup.lng) ? haversineKm(from.lat, from.lng, o.pickup.lat, o.pickup.lng) : null;
  const pickupLine = [o.pickup.address_line1, o.pickup.area].filter(Boolean).join(", ");
  const items = o.items ?? [];
  const named = items.slice(0, 3).map((it) => `${it.name} × ${it.quantity}`).join(", ");
  const label = "text-[13px] font-semibold text-ink-3";
  return (
    <article className={cn("overflow-hidden rounded-[20px] bg-card shadow-card ring-1", urgent ? "ring-2 ring-danger/60" : "ring-line")} aria-label={t("req.order", { number: o.order.order_number })}>
      <header className="flex items-center justify-between gap-3 bg-surface-2 px-4 py-2.5">
        <p className="min-w-0 truncate text-[15px] font-bold text-ink">{t("req.order", { number: o.order.order_number })}</p>
        <span className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[15px] font-bold tabular", over ? "bg-surface text-ink-3" : urgent ? "bg-danger-50 text-danger" : "bg-saffron-100 text-saffron-700")}
          aria-label={over ? t("req.timeUp") : now ? t("offer.expiresIn", { time: mmss(msLeft) }) : t("offer.expiresSoon")}>
          <Timer className="h-4 w-4" aria-hidden />{over ? "00:00" : now ? mmss(msLeft) : "--:--"}
        </span>
      </header>

      <div className="space-y-3 px-4 pb-3 pt-3">
        {compact ? null : (
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700" aria-hidden><StoreIcon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className={label}>{t("req.pickup")}</p>
              <p className="break-words text-[16px] leading-snug text-ink-2"><span className="font-bold text-ink">{o.pickup.name}</span>{pickupLine ? `, ${pickupLine}` : ""}</p>
              {toShop != null ? <p className="text-[14px] leading-snug text-ink-3">{t("req.youToShop", { km: formatKm(toShop) })}</p> : null}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info-50 text-info" aria-hidden><MapPin className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className={label}>{t("req.deliverTo")}</p>
            <p className="break-words text-[20px] font-extrabold leading-snug text-ink">{dest.area || dest.place || t("req.areaUnknown")}</p>
            {dest.street ? <p className="break-words text-[15px] leading-snug text-ink-2">{dest.street}</p> : null}
            {dest.landmark ? <p className="break-words text-[15px] leading-snug text-ink-2">{t("addr.near", { landmark: dest.landmark })}</p> : null}
            {dest.area && dest.place ? <p className="text-[15px] leading-snug text-ink-2">{dest.place}</p> : null}
            {!dest.area ? <p className="text-[14px] leading-snug text-ink-3">{t("req.areaNotWritten")}</p> : null}
            <p className="text-[14px] leading-snug text-ink-3">{km ? t("req.shopToCustomer", { km }) : t("req.noPin")}</p>
            {compact ? null : <p className="mt-1 text-[13px] leading-snug text-ink-3">{t("req.afterAccept")}</p>}
          </div>
          {dest.point ? (
            <a href={mapPointUrl(dest.point.lat, dest.point.lng)} target="_blank" rel="noreferrer" aria-label={t("req.seeOnMap")} className="tap mt-0.5 flex h-[60px] w-[68px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-surface-2 text-[13px] font-bold leading-none text-brand-800">
              <MapIcon className="h-5 w-5" aria-hidden />{t("req.areaMap")}
            </a>
          ) : null}
        </div>

        <p className="flex items-start gap-3 text-[15px] leading-snug text-ink-2">
          <span className="flex w-10 shrink-0 justify-center" aria-hidden><Package className="mt-0.5 h-5 w-5 text-ink-3" /></span>
          <span className="min-w-0"><span className="font-bold text-ink">{o.order.item_count === 1 ? t("req.itemOne") : t("req.items", { n: o.order.item_count })}</span>{named ? <span className="break-words">{`: ${named}`}{items.length > 3 ? ` ${t("req.more", { n: items.length - 3 })}` : ""}</span> : null}</span>
        </p>

        <div className="overflow-hidden rounded-2xl">
          <p className={cn("flex items-center gap-2.5 px-3.5 py-2.5 text-[17px] font-bold", cod ? "bg-saffron-50 text-saffron-700" : "bg-success-50 text-success")}>
            <Banknote className="h-6 w-6 shrink-0" aria-hidden />
            <span>{cod ? t("req.collectCash", { amount: formatINR(o.cod_amount) }) : t("req.prepaid")}</span>
          </p>
          <p className="flex items-center gap-2.5 border-t border-white bg-brand-50 px-3.5 py-2.5 text-[16px] font-bold text-brand-800">
            <IndianRupee className="h-6 w-6 shrink-0 p-0.5" aria-hidden />
            <span>{earns ? t("req.youEarn", { amount: formatINR(o.earning) }) : t("req.earnNotSet")}</span>
          </p>
        </div>
      </div>

      <div className="px-4 pb-4">
        {over ? <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-center text-[15px] font-semibold text-ink-2" role="status">{t("req.timeUp")}</p> : (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2.5">
            <Button size="lg" variant={armed ? "danger" : "outline"} className="h-14 whitespace-normal rounded-2xl px-2 text-[16px] leading-tight" loading={busy === "reject"} disabled={locked} onClick={onDecline}>{busy === "reject" ? t("req.wait") : armed ? t("req.declineAgain") : t("req.decline")}</Button>
            <Button size="lg" className="h-14 rounded-2xl px-2 text-[19px]" loading={busy === "accept"} disabled={locked} onClick={onAccept}>{busy === "accept" ? t("req.wait") : t("req.accept")}</Button>
          </div>
        )}
      </div>
    </article>
  );
}
