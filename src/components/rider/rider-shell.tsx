"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Satellite, SatelliteDish, ShieldAlert, Clock, Wifi, WifiOff, MapPinOff } from "lucide-react";
import { riderNav } from "@/config/site";
import { createClient } from "@/lib/supabase/client";
import { refreshRiderStatsAction } from "@/lib/actions/rider";
import { useNotifications, notificationHref } from "@/hooks/use-notifications";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { PwaClient } from "@/components/pwa/pwa-client";
import { LogoMark } from "@/components/ui/misc";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import type { DeliveryPartner, Notification } from "@/types/app";
import { cn } from "@/lib/utils";
import { useRiderStore, GPS_STALE_MS, type RealtimeState } from "./rider-store";
import { useRiderGps, useWakeLock } from "./use-rider-gps";
import { useNow } from "./use-now";
import { realtimeTopic } from "@/lib/realtime-topic";
import { OfferAlert } from "./offer-alert";
import { AlertBanner, type PushConfig } from "@/components/alerts/alert-setup";

const EMPTY_NOTIFICATIONS: Notification[] = [];

type ShellUser = { id: string; name: string | null };

/**
 * Phone-app chrome for the rider PWA: compact top bar with the honest connection + GPS line, status
 * banners, page content and a floating dock. Also owns the cross-page plumbing: one realtime channel on
 * the rider's assignments and own row (with reconnect / resume / network-back reconciliation), GPS
 * streaming while online or on a delivery, and notification toasts.
 */
export function RiderShell({ user, rider, initialActive, push, children }: { user: ShellUser; rider: DeliveryPartner; initialActive: boolean; push: PushConfig; children: React.ReactNode }) {
  const hydrate = useRiderStore((s) => s.hydrate);
  const setRider = useRiderStore((s) => s.setRider);
  const setStats = useRiderStore((s) => s.setStats);
  const bumpAssignments = useRiderStore((s) => s.bumpAssignments);
  const setRealtime = useRiderStore((s) => s.setRealtime);
  const storeRider = useRiderStore((s) => s.rider);
  const isOnline = useRiderStore((s) => (s.rider ? s.isOnline : rider.is_online));
  const activeDelivery = useRiderStore((s) => (s.rider ? s.activeDelivery : initialActive));
  const current = storeRider ?? rider;

  // Server props are the truth after every refresh; the store carries them between pages.
  React.useEffect(() => { hydrate(rider, initialActive); }, [rider, initialActive, hydrate]);

  // One realtime channel for the whole rider app: assignments (offers, state changes) + own row (approval, online flag).
  // Anything that happened while the socket was down, the tab hidden or the phone offline is picked up by one
  // refetch when the channel is back, the tab is shown or the network returns.
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

  // Live notifications: the hook keeps the list; toasts are raised here so the action opens the rider app, not the
  // customer order page. A delivery request is not toasted (the ringing popup is its alert), and the same order is
  // not toasted twice within a minute, so a re-offer or a retry never piles up messages.
  const { items } = useNotifications(user.id, EMPTY_NOTIFICATIONS, { toastNew: false });
  const seenRef = React.useRef<Set<string> | null>(null);
  const toastedRef = React.useRef<Map<string, number>>(new Map());
  React.useEffect(() => {
    if (!seenRef.current) { seenRef.current = new Set(items.map((n) => n.id)); return; }
    const seen = seenRef.current;
    const fresh = items.filter((n) => !seen.has(n.id));
    fresh.forEach((n) => seen.add(n.id));
    const latest = fresh.find((n) => n.type !== "delivery_offer");
    if (!latest) return;
    const key = `${latest.type}:${(latest.data as { order_id?: string } | null)?.order_id ?? latest.id}`;
    const last = toastedRef.current.get(key) ?? 0;
    if (Date.now() - last < 60_000) return;
    toastedRef.current.set(key, Date.now());
    toast.custom({ title: latest.title, description: latest.body, tone: latest.type.includes("cancel") || latest.type === "rider_offline" ? "warning" : "info", action: { label: "Open", onClick: () => { window.location.href = notificationHref(latest, "rider"); } } });
  }, [items]);

  const gpsOn = current.status === "active" && (isOnline || activeDelivery);
  useRiderGps(gpsOn);
  useWakeLock(activeDelivery);

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <RiderTopBar name={user.name} rider={current} isOnline={isOnline} gpsOn={gpsOn} />
      {/* Bottom padding clears the floating dock (its height + its 10 px offset + the safe area) with room to spare. */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-3" style={{ paddingBottom: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 40px)" }}>
        <OfflineBanner />
        <RiderStatusBanner status={current.status} />
        {current.status === "active" ? <AlertBanner portal="rider" push={push} href="/rider/profile#alerts" /> : null}
        {children}
      </main>
      <RiderBottomNav />
      {current.status === "active" ? <OfferAlert push={push} /> : null}
      <PwaClient appName="MD Rider" />
    </div>
  );
}

function RiderTopBar({ name, rider, isOnline, gpsOn }: { name: string | null; rider: DeliveryPartner; isOnline: boolean; gpsOn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur" style={{ paddingTop: "var(--safe-top)" }}>
      <div className="mx-auto flex min-h-14 w-full max-w-lg items-center gap-3 px-4 py-2">
        <Link href="/rider" className="flex shrink-0 items-center" aria-label="Rider home">
          <LogoMark size={32} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-tight text-ink">{name ?? "Delivery partner"}</p>
          <StateLine gpsOn={gpsOn} />
        </div>
        <span className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-bold", rider.status !== "active" ? "bg-surface-2 text-ink-3" : isOnline ? "bg-success-50 text-success" : "bg-surface-2 text-ink-2")} aria-live="polite">
          <span className={cn("h-2 w-2 rounded-full", rider.status !== "active" ? "bg-ink-4" : isOnline ? "bg-success animate-pulse-soft" : "bg-ink-4")} />
          {rider.status !== "active" ? (rider.status === "pending" ? "Pending" : "Suspended") : isOnline ? "Online" : "Offline"}
        </span>
      </div>
    </header>
  );
}

/** Where the connection and the GPS really stand, in one short line under the rider's name. */
function StateLine({ gpsOn }: { gpsOn: boolean }) {
  const realtime = useRiderStore((s) => s.realtime);
  const network = useNetworkOnline();
  const conn = !network ? { label: "No internet", tone: "text-danger", Icon: WifiOff } : realtime === "live" ? { label: "Live", tone: "text-success", Icon: Wifi } : realtime === "connecting" ? { label: "Connecting…", tone: "text-ink-3", Icon: WifiOff } : { label: "Reconnecting…", tone: "text-[#8a6300]", Icon: WifiOff };
  return (
    <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] font-semibold leading-tight" role="status">
      <span className={cn("inline-flex shrink-0 items-center gap-1", conn.tone)}><conn.Icon className="h-3 w-3" aria-hidden />{conn.label}</span>
      {gpsOn ? <GpsIndicator /> : null}
    </p>
  );
}

/**
 * "GPS live · 3 s ago · ±12 m" — only ever real fixes and their real age. A watch that stopped delivering
 * positions (hidden tab, lost signal) is reported as stale instead of live.
 */
export function GpsIndicator({ className }: { className?: string }) {
  const gps = useRiderStore((s) => s.gps);
  const now = useNow();
  const fixAge = gps.fix && now ? Math.max(0, now - gps.fix.at) : null;
  const stale = fixAge != null && fixAge > GPS_STALE_MS;
  const blocked = gps.status === "denied" || gps.status === "unavailable";
  const tone = blocked ? "text-danger" : stale || gps.sendError || (gps.status === "error" && !gps.fix) ? "text-[#8a6300]" : gps.status === "watching" && gps.fix ? "text-success" : "text-ink-3";
  const label = blocked ? (gps.status === "denied" ? "Location blocked" : "No GPS")
    : !gps.fix ? (gps.status === "error" ? "No GPS signal" : "Finding GPS…")
    : stale ? `GPS stale · ${agoLabel(fixAge!)}`
    : `GPS ${agoLabel(fixAge!)}${gps.fix.accuracy != null ? ` · ±${Math.round(gps.fix.accuracy)} m` : ""}${gps.sendError ? " · not syncing" : ""}`;
  const Icon = blocked ? MapPinOff : gps.status === "watching" && !stale ? SatelliteDish : Satellite;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", tone, className)}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

function agoLabel(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
}

function RiderStatusBanner({ status }: { status: DeliveryPartner["status"] }) {
  if (status === "active") return null;
  if (status === "pending") {
    return (
      <Alert tone="warning" icon={<Clock className="h-4 w-4" />} title="Awaiting approval" className="mb-3">
        Your rider account is under review, so you can&apos;t go online yet. Keep your vehicle and document details complete on the <Link href="/rider/profile" className="font-semibold underline">Profile</Link> tab — an admin activates accounts from there.
      </Alert>
    );
  }
  return (
    <Alert tone="danger" icon={<ShieldAlert className="h-4 w-4" />} title="Account suspended" className="mb-3">
      You can&apos;t take deliveries right now. Please <Link href="/account/support" className="font-semibold underline">contact support</Link> to resolve this.
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

/**
 * Honest no-network state: nothing on screen is pretended to be sent or received while the phone is
 * offline. Requests cannot reach the rider, and an Accept or OTP tap is refused by the action itself,
 * so the rider is told to retry once the connection returns.
 */
function OfflineBanner() {
  const online = useNetworkOnline();
  if (online) return null;
  return (
    <Alert tone="danger" icon={<WifiOff className="h-4 w-4" />} title="No internet connection" className="mb-3">
      New requests can&apos;t reach you and taps can&apos;t be sent until the connection is back. Nothing is accepted or marked delivered offline; tap the button again once you are connected.
    </Alert>
  );
}

/**
 * Floating glass dock, same language as the customer app but four tabs and shown at every width (this is a phone app).
 * Hidden while the on-screen keyboard is up so it never covers the field being typed in or the form's submit button.
 */
function RiderBottomNav() {
  const pathname = usePathname();
  const newRequests = useRiderStore((s) => s.offers.live);
  const active = useRiderStore((s) => s.activeDelivery);
  const keyboard = useKeyboardOpen();
  if (keyboard) return null;
  return (
    <nav className="fixed inset-x-3 z-40 mx-auto max-w-md" style={{ bottom: "calc(var(--safe-bottom) + 10px)" }} aria-label="Rider">
      <ul className="grid grid-cols-4 rounded-[26px] border border-white/60 bg-card/85 shadow-float backdrop-blur-2xl" style={{ height: "var(--bottom-nav-h)" }}>
        {riderNav.map((item) => {
          const isActive = item.href === "/rider" ? pathname === "/rider" : pathname.startsWith(item.href);
          const badge = item.href === "/rider" ? (active ? "•" : newRequests > 0 ? String(newRequests) : null) : null;
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={isActive ? "page" : undefined} className={cn("relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors", isActive ? "text-brand-700" : "text-ink-3")}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-all", isActive && "bg-brand-600 text-white shadow-[0_4px_12px_-4px_var(--color-brand-600)]")}>
                  <DynamicIcon name={item.icon} className="h-[18px] w-[18px]" />
                </span>
                {item.label}
                {badge ? <span className={cn("absolute right-[16%] top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold animate-pop", active ? "bg-brand-600 text-white" : "bg-saffron-500 text-ink")} aria-hidden>{badge}</span> : null}
                {badge ? <span className="sr-only">{active ? ", delivery in progress" : `, ${newRequests} new ${newRequests === 1 ? "request" : "requests"}`}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
