"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Satellite, SatelliteDish, ShieldAlert, Clock, Wifi, WifiOff } from "lucide-react";
import { riderNav } from "@/config/site";
import { createClient } from "@/lib/supabase/client";
import { refreshRiderStatsAction } from "@/lib/actions/rider";
import { useNotifications, notificationHref } from "@/hooks/use-notifications";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { PwaClient } from "@/components/pwa/pwa-client";
import { LogoMark } from "@/components/ui/misc";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import type { DeliveryPartner, Notification } from "@/types/app";
import { cn } from "@/lib/utils";
import { useRiderStore } from "./rider-store";
import { useRiderGps, useWakeLock } from "./use-rider-gps";
import { useNow } from "./use-now";

const EMPTY_NOTIFICATIONS: Notification[] = [];

type ShellUser = { id: string; name: string | null };

/**
 * Phone-app chrome for the rider PWA: compact top bar, status banners, page content and a
 * floating dock. Also owns the cross-page plumbing — realtime subscriptions on the rider's
 * assignments/row, GPS streaming while online or on a delivery, and notification toasts.
 */
export function RiderShell({ user, rider, initialActive, children }: { user: ShellUser; rider: DeliveryPartner; initialActive: boolean; children: React.ReactNode }) {
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
  React.useEffect(() => {
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (t) clearTimeout(t);
      t = setTimeout(async () => { bumpAssignments(); const r = await refreshRiderStatsAction(); if (r.ok) setStats(r.data); }, 400);
    };
    const ch = supabase.channel(`rider:${rider.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_assignments", filter: `rider_id=eq.${rider.id}` }, bump)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_partners", filter: `id=eq.${rider.id}` }, (payload) => setRider(payload.new as DeliveryPartner))
      .subscribe((status) => setRealtime(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); if (t) clearTimeout(t); setRealtime(false); };
  }, [rider.id, bumpAssignments, setStats, setRider, setRealtime]);

  // Live notifications: the hook keeps the list; toasts are raised here so the action opens the rider app, not the customer order page.
  const { items } = useNotifications(user.id, EMPTY_NOTIFICATIONS, { toastNew: false });
  const seenRef = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    if (!seenRef.current) { seenRef.current = new Set(items.map((n) => n.id)); return; }
    const seen = seenRef.current;
    const fresh = items.filter((n) => !seen.has(n.id));
    fresh.forEach((n) => seen.add(n.id));
    const latest = fresh[0];
    if (!latest) return;
    toast.custom({ title: latest.title, description: latest.body, tone: latest.type === "delivery_offer" ? "success" : latest.type.includes("cancel") ? "warning" : "info", action: { label: "Open", onClick: () => { window.location.href = notificationHref(latest, "rider"); } } });
  }, [items]);

  const gpsOn = current.status === "active" && (isOnline || activeDelivery);
  useRiderGps(gpsOn);
  useWakeLock(activeDelivery);

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <RiderTopBar name={user.name} rider={current} isOnline={isOnline} gpsOn={gpsOn} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-nav pt-3">
        <RiderStatusBanner status={current.status} />
        {children}
      </main>
      <RiderBottomNav />
      <PwaClient />
    </div>
  );
}

function RiderTopBar({ name, rider, isOnline, gpsOn }: { name: string | null; rider: DeliveryPartner; isOnline: boolean; gpsOn: boolean }) {
  const realtime = useRiderStore((s) => s.realtime);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur" style={{ paddingTop: "var(--safe-top)" }}>
      <div className="mx-auto flex h-14 w-full max-w-lg items-center gap-3 px-4">
        <Link href="/rider" className="flex items-center gap-2" aria-label="Rider home">
          <LogoMark size={30} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight text-ink">{name ?? "Delivery partner"}</p>
          <p className="truncate text-[11px] leading-tight text-ink-3">
            Merta Deal delivery partner
            <span className={cn("ml-1.5 inline-flex items-center gap-0.5 align-middle", realtime ? "text-success" : "text-ink-4")} title={realtime ? "Live updates connected" : "Live updates reconnecting"}>
              {realtime ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            </span>
          </p>
        </div>
        <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold", rider.status !== "active" ? "bg-surface-2 text-ink-3" : isOnline ? "bg-success-50 text-success" : "bg-surface-2 text-ink-2")} aria-live="polite">
          <span className={cn("h-2 w-2 rounded-full", rider.status !== "active" ? "bg-ink-4" : isOnline ? "bg-success animate-pulse-soft" : "bg-ink-4")} />
          {rider.status !== "active" ? (rider.status === "pending" ? "Pending" : "Suspended") : isOnline ? "Online" : "Offline"}
        </span>
      </div>
      {gpsOn ? <GpsIndicator /> : null}
    </header>
  );
}

/** "GPS live · ±12 m · 3s ago" — only ever shows real fixes and real send times. */
export function GpsIndicator({ className }: { className?: string }) {
  const gps = useRiderStore((s) => s.gps);
  const now = useNow();
  const ago = gps.lastSentAt && now ? Math.max(0, Math.round((now - gps.lastSentAt) / 1000)) : null;
  const stale = ago != null && ago > 30;
  const tone = gps.status === "denied" || gps.status === "unavailable" ? "text-danger" : gps.status === "error" || stale || gps.sendError ? "text-[#8a6300]" : gps.status === "watching" ? "text-success" : "text-ink-3";
  const label = gps.status === "denied" || gps.status === "unavailable" || (gps.status === "error" && !gps.fix)
    ? gps.error ?? "GPS unavailable"
    : gps.status === "starting" || !gps.fix
      ? "Acquiring GPS…"
      : `GPS live${gps.fix.accuracy != null ? ` · ±${Math.round(gps.fix.accuracy)} m` : ""}${ago != null ? ` · sent ${ago}s ago` : " · sending…"}${gps.sendError ? " · sync failed, retrying" : ""}`;
  return (
    <div className={cn("mx-auto flex w-full max-w-lg items-center gap-1.5 px-4 pb-1.5 text-[11px] font-semibold", tone, className)} role="status">
      {gps.status === "watching" ? <SatelliteDish className="h-3.5 w-3.5" /> : <Satellite className="h-3.5 w-3.5" />}
      <span className="truncate">{label}</span>
    </div>
  );
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

/** Floating glass dock, same language as the customer app but four tabs and shown at every width (this is a phone app). */
function RiderBottomNav() {
  const pathname = usePathname();
  const newRequests = useRiderStore((s) => s.stats?.new_requests ?? 0);
  const active = useRiderStore((s) => s.activeDelivery);
  return (
    <nav className="fixed inset-x-3 z-40 mx-auto max-w-md" style={{ bottom: "calc(var(--safe-bottom) + 10px)" }} aria-label="Rider">
      <ul className="grid grid-cols-4 rounded-[26px] border border-white/60 bg-card/85 shadow-float backdrop-blur-2xl" style={{ height: "var(--bottom-nav-h)" }}>
        {riderNav.map((item) => {
          const isActive = item.href === "/rider" ? pathname === "/rider" : pathname.startsWith(item.href);
          const badge = item.href === "/rider" ? (active ? "•" : newRequests > 0 ? String(newRequests) : null) : null;
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={isActive ? "page" : undefined} className={cn("relative flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold transition-colors", isActive ? "text-brand-700" : "text-ink-3")}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-all", isActive && "bg-brand-600 text-white shadow-[0_4px_12px_-4px_var(--color-brand-600)]")}>
                  <DynamicIcon name={item.icon} className="h-[18px] w-[18px]" />
                </span>
                {item.label}
                {badge ? <span className={cn("absolute right-[16%] top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold animate-pop", active ? "bg-brand-600 text-white" : "bg-saffron-500 text-ink")}>{badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
