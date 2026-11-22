"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Satellite, SatelliteDish, ShieldAlert, Clock, Wifi, WifiOff, MapPinOff, Home, Bike, Wallet, User, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { refreshRiderStatsAction, setRiderLanguageAction } from "@/lib/actions/rider";
import { useNotifications } from "@/hooks/use-notifications";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { PwaClient } from "@/components/pwa/pwa-client";
import { UpdatePrompt } from "@/components/pwa/update-prompt";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import type { DeliveryPartner, Notification } from "@/types/app";
import { cn } from "@/lib/utils";
import { useRiderStore, GPS_STALE_MS, type RealtimeState } from "./rider-store";
import { useRiderGps, useWakeLock } from "./use-rider-gps";
import { useNow } from "./use-now";
import { realtimeTopic } from "@/lib/realtime-topic";
import { OfferAlert } from "./offer-alert";
import { OnlineSwitch } from "./online-toggle";
import { AlertBanner, type PushConfig } from "@/components/alerts/alert-setup";
import { useRiderLang, useT, RIDER_LANGS, type RiderLang } from "@/lib/rider-i18n";
import { useAlertCopy } from "./alert-copy";

const EMPTY_NOTIFICATIONS: Notification[] = [];

/**
 * A "request closed" notice (0058) in the rider's language. The database writes notification text in
 * English; these three carry their reason as data, so the app can word them itself. Anything else is
 * shown as stored.
 */
export function riderNotificationText(n: Notification, t: ReturnType<typeof useT>["t"]): { title: string; body: string } {
  const d = (n.data ?? {}) as { reason?: unknown; order_number?: unknown };
  if (n.type === "delivery_cancelled" && typeof d.order_number === "string" && (d.reason === "taken" || d.reason === "withdrawn" || d.reason === "order_cancelled")) {
    return { title: t("notice.closedTitle", { order: d.order_number }), body: t(d.reason === "taken" ? "notice.taken" : d.reason === "withdrawn" ? "notice.withdrawn" : "notice.orderCancelled") };
  }
  return { title: n.title, body: n.body };
}

/** Where a rider notification leads: the delivery it is about when it names one (ids only), else the home tab. */
export function riderNotificationHref(n: Notification): string {
  const id = (n.data as { assignment_id?: unknown } | null)?.assignment_id;
  return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) && (n.type === "delivery_offer" || n.type === "delivery_cancelled") ? `/rider?a=${id}` : "/rider";
}

type ShellUser = { id: string; name: string | null };

/**
 * Phone-app frame for the rider PWA: "Hello <name>" with the online switch and the honest
 * connection + GPS line on top; the page; an icon-only tab bar at the bottom. Owns the cross-page
 * plumbing: one Realtime channel on this rider's assignments and own row (reconciled on reconnect,
 * tab resume and network return), GPS streaming while online or on a delivery, notification toasts,
 * and the language.
 */
export function RiderShell({ user, rider, initialActive, push, initialLang, children }: { user: ShellUser; rider: DeliveryPartner; initialActive: boolean; push: PushConfig; initialLang: RiderLang; children: React.ReactNode }) {
  const hydrate = useRiderStore((s) => s.hydrate);
  const setRider = useRiderStore((s) => s.setRider);
  const setStats = useRiderStore((s) => s.setStats);
  const bumpAssignments = useRiderStore((s) => s.bumpAssignments);
  const setRealtime = useRiderStore((s) => s.setRealtime);
  const storeRider = useRiderStore((s) => s.rider);
  const isOnline = useRiderStore((s) => (s.rider ? s.isOnline : rider.is_online));
  const activeDelivery = useRiderStore((s) => (s.rider ? s.activeDelivery : initialActive));
  const current = storeRider ?? rider;
  const lang = useRiderLang((s) => s.lang);
  const chosen = useRiderLang((s) => s.chosen);
  const setLang = useRiderLang((s) => s.setLang);

  React.useEffect(() => { hydrate(rider, initialActive); }, [rider, initialActive, hydrate]);
  React.useEffect(() => { if (!chosen && initialLang !== lang) setLang(initialLang, false); }, [chosen, initialLang, lang, setLang]);

  React.useEffect(() => {
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (t) clearTimeout(t);
      t = setTimeout(async () => { bumpAssignments(); const r = await refreshRiderStatsAction(); if (r.ok) setStats(r.data); }, 400);
    };
    let wasDown = false;
    const ch = supabase.channel(realtimeTopic(`rider:${rider.id}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_assignments", filter: `rider_id=eq.${rider.id}` }, bump)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_partners", filter: `id=eq.${rider.id}` }, (payload) => setRider(payload.new as DeliveryPartner))
      .subscribe((status) => {
        const next: RealtimeState = status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED" ? "offline" : "connecting";
        setRealtime(next);
        if (next === "live" && wasDown) bump();
        if (next !== "live") wasDown = true;
      });
    const onVisible = () => { if (document.visibilityState === "visible") bump(); };
    const onOnline = () => bump();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      supabase.removeChannel(ch); if (t) clearTimeout(t); setRealtime("connecting");
      document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onOnline);
    };
  }, [rider.id, bumpAssignments, setStats, setRider, setRealtime]);

  const { items } = useNotifications(user.id, EMPTY_NOTIFICATIONS, { toastNew: false });
  const seenRef = React.useRef<Set<string> | null>(null);
  const toastedRef = React.useRef<Map<string, number>>(new Map());
  const { t } = useT();
  const alertCopy = useAlertCopy();
  React.useEffect(() => {
    if (!seenRef.current) { seenRef.current = new Set(items.map((n) => n.id)); return; }
    const seen = seenRef.current;
    const fresh = items.filter((n) => !seen.has(n.id));
    fresh.forEach((n) => seen.add(n.id));
    const latest = fresh.find((n) => n.type !== "delivery_offer");
    if (!latest) return;
    const key = `${latest.type}:${(latest.data as { order_id?: string } | null)?.order_id ?? latest.id}`;
    if (Date.now() - (toastedRef.current.get(key) ?? 0) < 60_000) return;
    toastedRef.current.set(key, Date.now());
    const text = riderNotificationText(latest, t);
    toast.custom({ title: text.title, description: text.body, tone: latest.type.includes("cancel") || latest.type === "rider_offline" ? "warning" : "info", action: { label: t("common.open"), onClick: () => { window.location.href = riderNotificationHref(latest); } } });
  }, [items, t]);

  const gpsOn = current.status === "active" && (isOnline || activeDelivery);
  useRiderGps(gpsOn);
  useWakeLock(activeDelivery);

  return (
    <div lang={lang === "hi" ? "hi" : "en-IN"} className={cn("flex min-h-dvh flex-col bg-surface", lang === "hi" && "font-hindi")}>
      <RiderTopBar name={user.name} rider={current} isOnline={isOnline} gpsOn={gpsOn} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4" style={{ paddingBottom: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 28px)" }}>
        <OfflineBanner />
        <UpdatedBanner />
        <RiderStatusBanner status={current.status} />
        {current.status === "active" ? <AlertBanner portal="rider" push={push} href="/rider/profile#alerts" copy={alertCopy} /> : null}
        {children}
      </main>
      <RiderBottomNav />
      {current.status === "active" ? <OfferAlert push={push} /> : null}
      <PwaClient appName="MD Rider" />
      <UpdatePrompt />
    </div>
  );
}

/** Solid green app header: the date, "Hello Kayyum", the online switch, and the state line in a pill. */
function RiderTopBar({ name, rider, isOnline, gpsOn }: { name: string | null; rider: DeliveryPartner; isOnline: boolean; gpsOn: boolean }) {
  const { t } = useT();
  const lang = useRiderLang((s) => s.lang);
  const now = useNow();
  const first = (name ?? "").trim().split(/\s+/)[0] || t("rider.partner");
  const date = now ? new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(now) : "";
  const statusLabel = rider.status !== "active" ? (rider.status === "pending" ? t("status.pending") : t("status.suspended")) : isOnline ? t("status.online") : t("status.offline");
  return (
    <header className="sticky top-0 z-30 rounded-b-[24px] bg-brand-700 text-white shadow-[0_6px_20px_rgb(21_128_61/0.25)]" style={{ paddingTop: "var(--safe-top)" }}>
      <div className="mx-auto w-full max-w-lg px-5 pb-4 pt-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-white/70">{date}</p>
            <h1 className="truncate font-display text-[26px] font-extrabold leading-tight">{t("home.hello", { name: first })}</h1>
          </div>
          {rider.status === "active" ? <OnlineSwitch tone="light" className="mb-1" /> : null}
        </div>
        <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-bold">
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", rider.status !== "active" ? "bg-white/50" : isOnline ? "bg-[#86efac] animate-pulse-soft" : "bg-white/50")} />
            {statusLabel}
          </span>
          <span className="text-white/40" aria-hidden>·</span>
          <StateLine gpsOn={gpsOn} dark />
        </div>
      </div>
    </header>
  );
}

/** EN | हिं switch; remembered on this phone and saved to the profile so Account → Settings agrees. */
export function LangToggle({ className }: { className?: string }) {
  const lang = useRiderLang((s) => s.lang);
  const setLang = useRiderLang((s) => s.setLang);
  const pick = (l: RiderLang) => { if (l === lang) return; setLang(l, true); void setRiderLanguageAction(l); };
  return (
    <div role="group" aria-label="Language / भाषा" className={cn("flex h-9 shrink-0 items-center rounded-full bg-surface-2 p-0.5", className)}>
      {RIDER_LANGS.map((l) => (
        <button key={l.value} type="button" onClick={() => pick(l.value)} aria-pressed={lang === l.value} lang={l.value}
          className={cn("flex h-8 min-w-9 items-center justify-center rounded-full px-2 text-[12px] font-bold transition-colors", lang === l.value ? "bg-card text-ink shadow-sm" : "text-ink-3")}>{l.short}</button>
      ))}
    </div>
  );
}

/** Where the connection and the GPS really stand, in one short line. */
function StateLine({ gpsOn, dark }: { gpsOn: boolean; dark?: boolean }) {
  const { t } = useT();
  const realtime = useRiderStore((s) => s.realtime);
  const network = useNetworkOnline();
  const tones = dark ? DARK_TONES : LIGHT_TONES;
  const conn = !network ? { label: t("conn.noInternet"), tone: tones.danger, Icon: WifiOff } : realtime === "live" ? { label: t("conn.live"), tone: tones.ok, Icon: Wifi } : realtime === "connecting" ? { label: t("conn.connecting"), tone: tones.muted, Icon: WifiOff } : { label: t("conn.reconnecting"), tone: tones.warn, Icon: WifiOff };
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-semibold leading-tight" role="status">
      <span className={cn("inline-flex shrink-0 items-center gap-1", conn.tone)}><conn.Icon className="h-3 w-3" aria-hidden />{conn.label}</span>
      {gpsOn ? <GpsIndicator dark={dark} /> : null}
    </p>
  );
}

/** Text tones for the state line on a white card and on the green header. */
const LIGHT_TONES = { ok: "text-success", warn: "text-[#8a6300]", danger: "text-danger", muted: "text-ink-3" };
const DARK_TONES = { ok: "text-white", warn: "text-amber-200", danger: "text-red-200", muted: "text-white/70" };

/** "GPS 3 s ago · ±12 m": only real fixes and their real age; an old fix reads stale, never live. */
export function GpsIndicator({ className, dark }: { className?: string; dark?: boolean }) {
  const { t } = useT();
  const gps = useRiderStore((s) => s.gps);
  const now = useNow();
  const fixAge = gps.fix && now ? Math.max(0, now - gps.fix.at) : null;
  const stale = fixAge != null && fixAge > GPS_STALE_MS;
  const blocked = gps.status === "denied" || gps.status === "unavailable";
  const tones = dark ? DARK_TONES : LIGHT_TONES;
  const tone = blocked ? tones.danger : stale || gps.sendError || (gps.status === "error" && !gps.fix) ? tones.warn : gps.status === "watching" && gps.fix ? tones.ok : tones.muted;
  const label = blocked ? (gps.status === "denied" ? t("gps.blocked") : t("gps.none"))
    : !gps.fix ? (gps.status === "error" ? t("gps.noSignal") : t("gps.finding"))
    : stale ? t("gps.stale", { ago: agoLabel(fixAge!, t) })
    : `${t("gps.live", { ago: agoLabel(fixAge!, t) })}${gps.fix.accuracy != null ? ` · ±${Math.round(gps.fix.accuracy)} m` : ""}${gps.sendError ? ` · ${t("gps.notSyncing")}` : ""}`;
  const Icon = blocked ? MapPinOff : gps.status === "watching" && !stale ? SatelliteDish : Satellite;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", tone, className)}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

function agoLabel(ms: number, t: ReturnType<typeof useT>["t"]) {
  const s = Math.round(ms / 1000);
  if (s < 60) return t("time.secondsAgo", { n: s });
  const m = Math.floor(s / 60);
  return m < 60 ? t("time.minutesAgo", { n: m }) : t("time.hoursAgo", { n: Math.floor(m / 60) });
}

function RiderStatusBanner({ status }: { status: DeliveryPartner["status"] }) {
  const { t } = useT();
  if (status === "active") return null;
  if (status === "pending") {
    return (
      <Alert tone="warning" icon={<Clock className="h-4 w-4" />} title={t("banner.pendingTitle")} className="mb-3">
        {t("banner.pendingBody")} <Link href="/rider/profile" className="font-semibold underline">{t("nav.profile")}</Link>
      </Alert>
    );
  }
  return (
    <Alert tone="danger" icon={<ShieldAlert className="h-4 w-4" />} title={t("banner.suspendedTitle")} className="mb-3">
      {t("banner.suspendedBody")} <Link href="/account/support" className="font-semibold underline">{t("profile.support")}</Link>
    </Alert>
  );
}

/** True while the browser reports a network connection (`navigator.onLine` plus the online/offline events). */
export function useNetworkOnline() {
  return React.useSyncExternalStore(
    (cb) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; },
    () => navigator.onLine,
    () => true,
  );
}

/** Honest no-network state: nothing is pretended to be sent while the phone is offline. */
function OfflineBanner() {
  const { t } = useT();
  const online = useNetworkOnline();
  if (online) return null;
  return <Alert tone="danger" icon={<WifiOff className="h-4 w-4" />} title={t("offline.title")} className="mb-3">{t("offline.body")}</Alert>;
}

/**
 * The shared UpdatePrompt activates a new service worker quietly and never reloads the page. A rider app
 * stays open for a whole shift, so once the new worker has taken over this says so and offers the reload;
 * the rider picks the moment (never forced, so an OTP being typed is not lost). Shown only when a worker
 * was already in charge at load, so the very first install does not look like an update.
 */
function UpdatedBanner() {
  const { t } = useT();
  const [updated, setUpdated] = React.useState(false);
  React.useEffect(() => {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
    const onChange = () => setUpdated(true);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  }, []);
  if (!updated) return null;
  return (
    <Alert tone="info" icon={<RefreshCw className="h-4 w-4" />} title={t("update.title")} className="mb-3">
      <p>{t("update.body")}</p>
      <div className="mt-2"><Button size="sm" className="h-10 rounded-xl" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" aria-hidden /> {t("update.button")}</Button></div>
    </Alert>
  );
}

const NAV = [
  { href: "/rider", key: "nav.home", Icon: Home },
  { href: "/rider/deliveries", key: "nav.deliveries", Icon: Bike },
  { href: "/rider/earnings", key: "nav.earnings", Icon: Wallet },
  { href: "/rider/profile", key: "nav.profile", Icon: User },
] as const;

/** Icon-only tab bar above the home indicator; the active tab is filled green. Hidden while the keyboard is up. */
function RiderBottomNav() {
  const { t } = useT();
  const pathname = usePathname();
  const newRequests = useRiderStore((s) => s.offers.live);
  const active = useRiderStore((s) => s.activeDelivery);
  const keyboard = useKeyboardOpen();
  if (keyboard) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-card shadow-[0_-4px_20px_rgb(21_128_61/0.08)]" style={{ paddingBottom: "var(--safe-bottom)" }} aria-label={t("nav.label")}>
      <ul className="mx-auto grid max-w-lg grid-cols-4" style={{ height: "var(--bottom-nav-h)" }}>
        {NAV.map((item) => {
          const isActive = item.href === "/rider" ? pathname === "/rider" : pathname.startsWith(item.href);
          const badge = item.href === "/rider" ? (active ? "•" : newRequests > 0 ? String(newRequests) : null) : null;
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={isActive ? "page" : undefined} aria-label={t(item.key)} className="relative flex h-full flex-col items-center justify-center">
                <span className={cn("flex h-11 w-11 items-center justify-center rounded-2xl transition-colors", isActive ? "bg-brand-50 text-brand-700" : "text-ink-3")}><item.Icon className="h-6 w-6" strokeWidth={isActive ? 2.4 : 2} /></span>
                <span className={cn("mt-0.5 h-1 w-1 rounded-full", isActive ? "bg-brand-700" : "bg-transparent")} aria-hidden />
                {badge ? <span className={cn("absolute right-[26%] top-2 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white animate-pop", active ? "bg-brand-600" : "bg-saffron-500 text-ink")} aria-hidden>{badge}</span> : null}
                {badge ? <span className="sr-only">{active ? t("nav.deliveryInProgress") : t("nav.newRequests", { n: newRequests })}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
