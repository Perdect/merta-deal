"use client";
import * as React from "react";
import Link from "next/link";
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { Bike, MapPinOff, Wifi } from "lucide-react";
import { env, isMapsConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import type { LiveRider } from "@/lib/data/admin";
import { site } from "@/config/site";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { cn, haversineKm, timeAgo } from "@/lib/utils";

/**
 * Live rider board for admins. Always renders the list (with last-fix age and distance from the city
 * centre); renders a Google map with all online riders only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set.
 * Positions update via Supabase Realtime on `delivery_partners` (RLS: admins can read all riders).
 */
export function RidersLiveBoard({ initial }: { initial: LiveRider[] }) {
  const [riders, setRiders] = React.useState(initial);
  const [prevInitial, setPrevInitial] = React.useState(initial);
  if (initial !== prevInitial) { setPrevInitial(initial); setRiders(initial); }
  const [connected, setConnected] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  React.useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel("admin:riders")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_partners" }, (payload) => {
        const r = payload.new as { id: string; is_online: boolean; status: string; current_lat: number | null; current_lng: number | null; last_location_at: string | null };
        setRiders((cur) => {
          const idx = cur.findIndex((x) => x.id === r.id);
          if (!r.is_online || r.status !== "active") return idx >= 0 ? cur.filter((x) => x.id !== r.id) : cur;
          if (idx < 0) return cur; // new riders appear on next server refresh (need profile join)
          const next = [...cur]; next[idx] = { ...next[idx], lat: r.current_lat, lng: r.current_lng, last_location_at: r.last_location_at }; return next;
        });
      })
      .subscribe((s) => setConnected(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); };
  }, []);
  const withFix = riders.filter((r) => r.lat != null && r.lng != null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-ink-3"><span>{riders.length} online · {riders.filter((r) => r.busy).length} on a delivery</span><span className={cn("inline-flex items-center gap-1 font-semibold", connected ? "text-success" : "text-ink-4")}><Wifi className="h-3 w-3" />{connected ? "Live" : "Connecting…"}</span></div>
      {isMapsConfigured() ? <RidersMap riders={withFix} /> : (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-line-2 bg-surface p-4 text-sm">
          <MapPinOff className="mt-0.5 h-5 w-5 shrink-0 text-ink-3" />
          <div><p className="font-semibold text-ink">Map view needs a Google Maps key</p><p className="text-xs text-ink-3">Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to plot all online riders. Positions still stream live into the list below.</p></div>
        </div>
      )}
      <ul className="divide-y divide-line rounded-lg border border-line bg-card px-4">
        {riders.length === 0 ? <li className="py-8 text-center text-sm text-ink-3">No riders online right now.</li> : riders.map((r) => {
          const km = r.lat != null && r.lng != null ? haversineKm(r.lat, r.lng, site.center.lat, site.center.lng) : null;
          const stale = r.last_location_at ? now - new Date(r.last_location_at).getTime() > 5 * 60_000 : true;
          return (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={r.name} src={r.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink"><Link href={`/admin/riders/${r.id}`} className="hover:underline">{r.name ?? "Rider"}</Link> <span className="text-xs font-normal capitalize text-ink-3">{r.vehicle_type}{r.vehicle_number ? ` · ${r.vehicle_number}` : ""}</span></p>
                <p className="text-xs text-ink-3">{km != null ? `${km.toFixed(1)} km from ${site.city} centre · ` : "No GPS fix · "}<span className={stale ? "text-warning" : ""}>{r.last_location_at ? `GPS ${timeAgo(r.last_location_at)}` : "never"}</span></p>
              </div>
              {r.busy && r.current_order ? <Link href={`/admin/orders/${r.current_order.id}`}><Badge tone="info"><Bike className="h-3 w-3" /> {r.current_order.order_number}</Badge></Link> : <Badge tone="success">Free</Badge>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RidersMap({ riders }: { riders: LiveRider[] }) {
  const [active, setActive] = React.useState<string | null>(null);
  return (
    <APIProvider apiKey={env.mapsKey}>
      <div className="overflow-hidden rounded-lg border border-line">
        <Map defaultCenter={site.center} defaultZoom={13} mapId="merta-deal-admin-riders" gestureHandling="greedy" disableDefaultUI className="h-72 w-full sm:h-96">
          {riders.map((r) => (
            <AdvancedMarker key={r.id} position={{ lat: r.lat!, lng: r.lng! }} title={r.name ?? "Rider"} onClick={() => setActive(r.id)}>
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-white shadow-float", r.busy ? "bg-info" : "bg-saffron-500")}><Bike className="h-4 w-4" /></span>
            </AdvancedMarker>
          ))}
          {riders.filter((r) => r.id === active).map((r) => (
            <InfoWindow key={r.id} position={{ lat: r.lat!, lng: r.lng! }} onCloseClick={() => setActive(null)}>
              <div className="text-xs"><p className="font-semibold">{r.name}</p><p>{r.vehicle_type} {r.vehicle_number ?? ""}</p><p>{r.busy ? `On ${r.current_order?.order_number}` : "Free"} · GPS {timeAgo(r.last_location_at)}</p></div>
            </InfoWindow>
          ))}
          <FitAll riders={riders} />
        </Map>
      </div>
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
