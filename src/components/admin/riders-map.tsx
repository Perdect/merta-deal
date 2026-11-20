"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { Bike, MapPinOff } from "lucide-react";
import { env, isMapsConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import type { LiveRider } from "@/lib/data/admin";
import { site } from "@/config/site";
import { Avatar } from "@/components/ui/misc";
import { EmptyBlock, StatusPill } from "@/components/admin/kit";
import { VEHICLE_LABEL } from "@/components/admin/ops/pills";
import { cn, haversineKm, timeAgo } from "@/lib/utils";
import { realtimeTopic } from "@/lib/realtime-topic";
import { requestLiveRefresh } from "@/components/admin/kit/live-list";

const later = (a: string | null | undefined, b: string | null | undefined) => (!a ? b ?? null : !b ? a : new Date(a).getTime() >= new Date(b).getTime() ? a : b);

/**
 * Live rider board for admins. Always renders the list (with last-fix age and distance from the city
 * centre); renders a Google map with all online riders only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set.
 * Positions update via Supabase Realtime on `delivery_partners` (RLS: admins can read all riders).
 * `contact` is each rider's last contact as the server read it (app heartbeat or GPS fix, whichever is
 * later); the same Realtime rows keep it current. A rider going online or offline asks the server page
 * to re-render, so the counts above the board and the list below it never disagree with it for long.
 */
export function RidersLiveBoard({ initial, contact }: { initial: LiveRider[]; contact?: Record<string, string | null> }) {
  const router = useRouter();
  const [riders, setRiders] = React.useState(initial);
  const [seen, setSeen] = React.useState<Record<string, string | null>>(contact ?? {});
  const [prevInitial, setPrevInitial] = React.useState(initial);
  const [prevContact, setPrevContact] = React.useState(contact);
  if (initial !== prevInitial) { setPrevInitial(initial); setRiders(initial); }
  if (contact !== prevContact) { setPrevContact(contact); setSeen(contact ?? {}); }
  const ridersRef = React.useRef(riders);
  React.useEffect(() => { ridersRef.current = riders; }, [riders]);
  const [status, setStatus] = React.useState<"connecting" | "live" | "offline">("connecting");
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  React.useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(realtimeTopic("admin:riders"))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_partners" }, (payload) => {
        const r = payload.new as { id: string; is_online: boolean; status: string; current_lat: number | null; current_lng: number | null; last_location_at: string | null; last_seen_at?: string | null };
        const shown = ridersRef.current.some((x) => x.id === r.id);
        const onNow = r.is_online && r.status === "active";
        // Joined or left the board: the server page holds the name, the counts and the list, so let it re-render.
        if (shown !== onNow) requestLiveRefresh(() => React.startTransition(() => router.refresh()), 800);
        if (onNow) setSeen((cur) => { const at = later(r.last_seen_at, r.last_location_at); return at && cur[r.id] !== at ? { ...cur, [r.id]: at } : cur; });
        setRiders((cur) => {
          const idx = cur.findIndex((x) => x.id === r.id);
          if (!r.is_online || r.status !== "active") return idx >= 0 ? cur.filter((x) => x.id !== r.id) : cur;
          if (idx < 0) return cur; // new riders appear on next server refresh (need profile join)
          const next = [...cur]; next[idx] = { ...next[idx], lat: r.current_lat, lng: r.current_lng, last_location_at: r.last_location_at }; return next;
        });
      })
      .subscribe((s) => setStatus(s === "SUBSCRIBED" ? "live" : s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED" ? "offline" : "connecting"));
    return () => { supabase.removeChannel(ch); };
  }, [router]);
  const withFix = riders.filter((r) => r.lat != null && r.lng != null);
  const busy = riders.filter((r) => r.busy).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
        <span className="tabular"><span className="font-semibold text-ink">{riders.length}</span> online · <span className="font-semibold text-ink">{busy}</span> on a delivery · <span className="font-semibold text-ink">{riders.length - busy}</span> free</span>
        <StatusPill tone={status === "live" ? "green" : status === "offline" ? "red" : "neutral"}>{status === "live" ? "Live updates on" : status === "offline" ? "Live updates off — refresh the page" : "Connecting…"}</StatusPill>
      </div>
      {isMapsConfigured() ? <RidersMap riders={withFix} /> : (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-line-2 bg-surface p-3 text-sm">
          <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
          <div><p className="font-medium text-ink">Map view needs a Google Maps key</p><p className="text-xs text-ink-3">Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to plot online riders. Positions still stream live into the list below.</p></div>
        </div>
      )}
      {riders.length === 0 ? (
        <EmptyBlock icon={Bike} title="No riders online right now" description="Riders appear here as soon as an approved rider goes online in the rider app." />
      ) : (
        <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {riders.map((r) => {
            const km = r.lat != null && r.lng != null ? haversineKm(r.lat, r.lng, site.center.lat, site.center.lng) : null;
            const stale = r.last_location_at ? now - new Date(r.last_location_at).getTime() > 5 * 60_000 : true;
            const contactAt = later(seen[r.id], r.last_location_at);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                <Avatar name={r.name} src={r.avatar_url} size={32} className="shrink-0" />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm font-medium text-ink"><Link href={`/admin/riders/${r.id}`} className="hover:underline">{r.name ?? "Rider"}</Link> <span className="text-xs font-normal text-ink-3">{VEHICLE_LABEL[r.vehicle_type] ?? r.vehicle_type}{r.vehicle_number ? ` · ${r.vehicle_number}` : ""}</span></p>
                  {/* Most useful first, and it wraps instead of cutting off on a phone: heard from → GPS age → where. */}
                  <p className="text-xs text-ink-3">{contactAt ? `Last seen ${timeAgo(contactAt)} · ` : ""}<span className={stale ? "font-medium text-warning" : ""}>{r.last_location_at ? `GPS ${timeAgo(r.last_location_at)}${stale ? " (stale)" : ""}` : "GPS never reported"}</span>{km != null ? ` · ${km.toFixed(1)} km from ${site.city} centre` : ""}</p>
                </div>
                {r.busy && r.current_order ? (
                  <Link href={`/admin/orders/${r.current_order.id}`} className="shrink-0 hover:opacity-80"><StatusPill tone="blue">{r.current_order.status === "picked_up" ? "Delivering" : "Going to pickup"} · {r.current_order.order_number}</StatusPill></Link>
                ) : <StatusPill tone="green" className="shrink-0">Free</StatusPill>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RidersMap({ riders }: { riders: LiveRider[] }) {
  const [active, setActive] = React.useState<string | null>(null);
  return (
    <APIProvider apiKey={env.mapsKey}>
      <div className="overflow-hidden rounded-lg border border-line">
        <Map defaultCenter={site.center} defaultZoom={13} mapId="merta-deal-admin-riders" gestureHandling="cooperative" disableDefaultUI className="h-64 w-full sm:h-80">
          {riders.map((r) => (
            <AdvancedMarker key={r.id} position={{ lat: r.lat!, lng: r.lng! }} title={`${r.name ?? "Rider"} — ${r.busy ? "on a delivery" : "free"}`} onClick={() => setActive(r.id)}>
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-white shadow-float", r.busy ? "bg-info" : "bg-success")}><Bike className="h-4 w-4" aria-hidden /></span>
            </AdvancedMarker>
          ))}
          {riders.filter((r) => r.id === active).map((r) => (
            <InfoWindow key={r.id} position={{ lat: r.lat!, lng: r.lng! }} onCloseClick={() => setActive(null)}>
              <div className="text-xs"><p className="font-semibold">{r.name}</p><p>{VEHICLE_LABEL[r.vehicle_type] ?? r.vehicle_type} {r.vehicle_number ?? ""}</p><p>{r.busy ? `On ${r.current_order?.order_number}` : "Free"} · GPS {timeAgo(r.last_location_at)}</p></div>
            </InfoWindow>
          ))}
          <FitAll riders={riders} />
        </Map>
      </div>
      <p className="mt-1.5 flex flex-wrap gap-3 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden />Free</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-info" aria-hidden />On a delivery</span>
      </p>
    </APIProvider>
  );
}

function FitAll({ riders }: { riders: LiveRider[] }) {
  const map = useMap();
  const fitted = React.useRef(false);
  React.useEffect(() => {
    if (!map || fitted.current || riders.length < 2) return;
    const b = new google.maps.LatLngBounds(); riders.forEach((r) => b.extend({ lat: r.lat!, lng: r.lng! })); map.fitBounds(b, 48); fitted.current = true;
  }, [map, riders]);
  return null;
}
