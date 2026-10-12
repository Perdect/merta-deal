"use client";
import * as React from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Bike, Store as StoreIcon, Home, Navigation, MapPinOff } from "lucide-react";
import { env, isMapsConfigured } from "@/lib/env";
import type { TrackingLocation } from "@/types/app";
import { cn, haversineKm, timeAgo } from "@/lib/utils";

type Point = { lat: number; lng: number };
type Props = { store: Point & { name: string }; customer: Point | null; rider: TrackingLocation | null; trail: Point[]; className?: string; showRoute?: boolean };

/**
 * Live delivery map. Uses Google Maps when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set. Without a key it
 * renders an honest fallback (distance, last GPS fix, open-in-maps link) — never a fake map.
 */
export function LiveMap(props: Props) {
  if (!isMapsConfigured()) return <MapFallback {...props} />;
  return (
    <APIProvider apiKey={env.mapsKey}>
      <div className={cn("overflow-hidden rounded-lg border border-line", props.className)}>
        <Map defaultCenter={props.store} defaultZoom={14} mapId={env.mapsMapId} gestureHandling="greedy" disableDefaultUI className="h-64 w-full sm:h-80">
          <AdvancedMarker position={props.store} title={props.store.name}><Pin icon={<StoreIcon className="h-4 w-4" />} color="#329537" /></AdvancedMarker>
          {props.customer ? <AdvancedMarker position={props.customer} title="Delivery address"><Pin icon={<Home className="h-4 w-4" />} color="#2563EB" /></AdvancedMarker> : null}
          {props.rider ? <AdvancedMarker position={{ lat: props.rider.lat, lng: props.rider.lng }} title="Rider"><Pin icon={<Bike className="h-4 w-4" />} color="#F2A93B" pulse /></AdvancedMarker> : null}
          <FitAndTrail store={props.store} customer={props.customer} rider={props.rider} trail={props.trail} showRoute={props.showRoute} />
        </Map>
      </div>
    </APIProvider>
  );
}

function Pin({ icon, color, pulse }: { icon: React.ReactNode; color: string; pulse?: boolean }) {
  return <span className={cn("flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-white shadow-float", pulse && "animate-pulse-soft")} style={{ backgroundColor: color }}>{icon}</span>;
}

function FitAndTrail({ store, customer, rider, trail, showRoute }: Omit<Props, "className">) {
  const map = useMap();
  const polyRef = React.useRef<google.maps.Polyline | null>(null);
  const routeRef = React.useRef<google.maps.DirectionsRenderer | null>(null);
  React.useEffect(() => {
    if (!map) return;
    const b = new google.maps.LatLngBounds(); b.extend(store); if (customer) b.extend(customer); if (rider) b.extend({ lat: rider.lat, lng: rider.lng });
    map.fitBounds(b, 60);
  }, [map, store, customer, rider?.lat, rider?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!map) return;
    polyRef.current?.setMap(null);
    if (trail.length > 1) { polyRef.current = new google.maps.Polyline({ path: trail, strokeColor: "#F2A93B", strokeOpacity: 0.9, strokeWeight: 4, map }); }
    return () => polyRef.current?.setMap(null);
  }, [map, trail]);
  React.useEffect(() => {
    if (!map || !showRoute || !customer) return;
    const origin = rider ? { lat: rider.lat, lng: rider.lng } : store;
    const svc = new google.maps.DirectionsService();
    routeRef.current?.setMap(null);
    routeRef.current = new google.maps.DirectionsRenderer({ map, suppressMarkers: true, polylineOptions: { strokeColor: "#329537", strokeWeight: 4, strokeOpacity: 0.7 } });
    svc.route({ origin, destination: customer, travelMode: google.maps.TravelMode.DRIVING }, (res, status) => { if (status === "OK" && res) routeRef.current?.setDirections(res); });
    return () => routeRef.current?.setMap(null);
  }, [map, showRoute, customer?.lat, customer?.lng, rider?.lat, rider?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function MapFallback({ store, customer, rider, className }: Props) {
  const dest = customer ?? store;
  const km = rider ? haversineKm(rider.lat, rider.lng, dest.lat, dest.lng) : null;
  const dirUrl = `https://www.google.com/maps/dir/?api=1&origin=${rider ? `${rider.lat},${rider.lng}` : `${store.lat},${store.lng}`}&destination=${dest.lat},${dest.lng}&travelmode=driving`;
  return (
    <div className={cn("rounded-lg border border-dashed border-line-2 bg-surface p-4", className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-3"><MapPinOff className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1 text-sm">
          {rider ? (
            <>
              <p className="font-semibold text-ink">Rider is about {km!.toFixed(1)} km away <span className="font-normal text-ink-3">(straight-line estimate)</span></p>
              <p className="text-xs text-ink-3">Last GPS update {timeAgo(rider.recorded_at)}{rider.speed_mps ? ` · ${Math.round(rider.speed_mps * 3.6)} km/h` : ""}{rider.accuracy_m ? ` · ±${Math.round(rider.accuracy_m)} m` : ""}</p>
            </>
          ) : <p className="font-semibold text-ink">Live rider location will appear here once a rider is on the way.</p>}
          <p className="mt-1 text-xs text-ink-3">Interactive map requires a Google Maps API key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY). GPS updates still stream in real time.</p>
          <a href={dirUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><Navigation className="h-3.5 w-3.5" /> Open route in Google Maps</a>
        </div>
      </div>
    </div>
  );
}
