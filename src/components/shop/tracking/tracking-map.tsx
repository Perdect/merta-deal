"use client";
import * as React from "react";
import { APIProvider, APILoadingStatus, AdvancedMarker, Map, useApiLoadingStatus, useMap } from "@vis.gl/react-google-maps";
import { Bike, Home, LocateFixed, MapPinOff, Navigation, Store as StoreIcon, WifiOff } from "lucide-react";
import { env, isMapsConfigured } from "@/lib/env";
import type { TrackingLocation } from "@/types/app";
import { FitAndTrail, Pin } from "@/components/shop/live-map";
import { cn, haversineKm } from "@/lib/utils";

type Point = { lat: number; lng: number };
/** Where the order is before a rider has it: just placed, being packed, or packed and waiting. */
export type MapStage = "placed" | "packing" | "packed";
type Props = {
  /** Null when the pickup point has no coordinates saved: it is left off the map, never placed at a guess. */
  store: (Point & { name: string }) | null;
  customer: Point | null;
  /** The rider's last real GPS fix, or null while there is none. */
  rider: TrackingLocation | null;
  trail: Point[];
  /** True once a rider has accepted: the caption then talks about them, not about the packed order. */
  riderAssigned: boolean;
  /** What the caption says until then. */
  stage?: MapStage;
  /** The page's clock, so "updated … ago" moves without a timer of its own. */
  now: number;
  offline?: boolean;
  className?: string;
};

const COLORS = { store: "#329537", customer: "#2563EB", rider: "#F2A93B" };
/** A fix older than this is called what it is — a last known position — and stops pulsing. */
const STALE_MS = 60_000;

const ago = (ms: number) => (ms < 45_000 ? "just now" : ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min ago` : `${Math.round(ms / 3_600_000)} hr ago`);
/** Metres to the nearest 50 under a kilometre (a figure that would round up to 1000 m reads as 1.0 km). */
const distance = (km: number) => (km < 0.975 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km.toFixed(1)} km`);

/**
 * Google reports a refused key (wrong key, a referrer it does not allow, billing) by calling
 * `window.gm_authFailure` — once per page, and the loader's own status does not change. The answer is
 * remembered here so a map opened later on the same page load knows it too.
 */
let keyRefused = false;
const refusedListeners = new Set<() => void>();
function watchKeyRefusal(onRefused: () => void) {
  if (keyRefused) { onRefused(); return () => {}; }
  refusedListeners.add(onRefused);
  const w = window as unknown as { gm_authFailure?: () => void; __mdAuthHooked?: boolean };
  if (!w.__mdAuthHooked) {
    w.__mdAuthHooked = true;
    const prev = w.gm_authFailure;
    w.gm_authFailure = () => { prev?.(); keyRefused = true; for (const l of refusedListeners) l(); };
  }
  return () => { refusedListeners.delete(onRefused); };
}

/** What the caption under the map says. Every line is read from the points and the fix we actually hold. */
function caption({ store, customer, rider, riderAssigned, stage = "packed", now }: Pick<Props, "store" | "customer" | "rider" | "riderAssigned" | "stage" | "now">) {
  if (!riderAssigned) {
    const km = store && customer ? haversineKm(store.lat, store.lng, customer.lat, customer.lng) : null;
    const title = stage === "packed" ? (store ? `Packed at ${store.name}` : "Your order is packed")
      : stage === "packing" ? (store ? `Being packed at ${store.name}` : "Your order is being packed")
      : store && customer ? `From ${store.name} to your address` : customer ? "Your delivery address" : store ? store.name : "Your order";
    return { title, note: `${km != null ? `About ${distance(km)} apart in a straight line. ` : ""}The rider's location appears here once one accepts your order.`, stale: false, rider: false };
  }
  if (!rider) return { title: "Waiting for the rider's location", note: "It shows as soon as their phone shares it.", stale: false, rider: true };
  const age = Math.max(0, now - new Date(rider.recorded_at).getTime());
  const stale = age > STALE_MS;
  const km = customer ? haversineKm(rider.lat, rider.lng, customer.lat, customer.lng) : null;
  if (stale) return { title: `Rider's last known location · ${ago(age)}`, note: "Their phone has not reported since. The map moves again when it does.", stale, rider: true };
  return { title: km != null ? `Rider is about ${distance(km)} away` : "Rider's location is live", note: km != null ? `Straight-line distance · updated ${ago(age)}` : `Updated ${ago(age)}`, stale, rider: true };
}
type Caption = ReturnType<typeof caption>;

/** The caption as a row: an icon tile, the headline and the line that qualifies it. */
function CaptionRow({ c, className }: { c: Caption; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex items-center gap-3", className)}>
      <span aria-hidden className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-md", c.stale ? "bg-warning-50 text-warning" : c.rider ? "bg-saffron-50 text-saffron-700" : "bg-brand-50 text-brand-700")}>
        {c.rider ? <Bike className="h-5 w-5" /> : <StoreIcon className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[15px] font-bold leading-snug", c.stale ? "text-[#8a6300]" : "text-ink")}>{c.title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{c.note}</p>
      </div>
    </div>
  );
}

/**
 * A dashed straight line from the pickup point to the address, shown until a rider has the order. It
 * links the two pins and nothing more: it is not a road route and no time is read from it (the caption
 * calls the distance straight-line). Once a rider accepts, Google's road route and the trail of real
 * fixes take its place.
 */
function StraightLink({ from, to }: { from: Point; to: Point }) {
  const map = useMap();
  React.useEffect(() => {
    if (!map) return;
    const line = new google.maps.Polyline({
      map, path: [from, to], clickable: false, strokeOpacity: 0, zIndex: 1,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeColor: "#166534", strokeOpacity: 0.75, scale: 3 }, offset: "0", repeat: "14px" }],
    });
    return () => line.setMap(null);
  }, [map, from.lat, from.lng, to.lat, to.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * The customer's delivery map, shown from the moment the order is placed: the shop, the address and —
 * once one has the order and their phone has reported — the rider's real position, with the caption in
 * a row under the map. It never draws anything it was not given: no rider pin without a fix, no shop
 * pin without coordinates, no route unless Google returns one (the dashed line before a rider accepts
 * is a straight link between the two pins, and is labelled as such). When the map itself cannot load
 * it says so and still gives the distance and the last update from the fix it holds.
 */
export function TrackingMap(props: Props) {
  const hasPoint = Boolean(props.store || props.customer || props.rider);
  if (!isMapsConfigured() || !hasPoint) return <MapUnavailable {...props} reason={hasPoint ? "unavailable" : "no-coordinates"} />;
  return (
    <APIProvider apiKey={env.mapsKey}>
      <Loaded {...props} />
    </APIProvider>
  );
}

function Loaded(props: Props) {
  const { store, customer, rider, trail, riderAssigned, stage, now, offline, className } = props;
  const status = useApiLoadingStatus();
  const [tiles, setTiles] = React.useState(false);
  const [refit, setRefit] = React.useState(0);
  const [refused, setRefused] = React.useState(false);
  const [slow, setSlow] = React.useState(false);
  const wrap = React.useRef<HTMLElement>(null);
  // A refused key: Google's callback is the signal, with its "Something went wrong" box (when it
  // paints one into the map) as the second.
  React.useEffect(() => {
    const stop = watchKeyRefusal(() => setRefused(true));
    const el = wrap.current;
    const check = () => { if (el?.querySelector(".gm-err-container")) setRefused(true); };
    const mo = new MutationObserver(check); if (el) mo.observe(el, { childList: true, subtree: true }); check();
    return () => { stop(); mo.disconnect(); };
  }, []);
  // A slow connection is not a failure: the map stays mounted and the message says it is still coming.
  React.useEffect(() => {
    if (tiles || offline) return;
    const t = setTimeout(() => setSlow(true), 12_000);
    return () => clearTimeout(t);
  }, [tiles, offline]);
  if (refused || status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) return <MapUnavailable {...props} reason="unavailable" />;

  const c = caption({ store, customer, rider, riderAssigned, stage, now });
  const centre = customer ?? store ?? (rider ? { lat: rider.lat, lng: rider.lng } : { lat: 0, lng: 0 });
  return (
    <section ref={wrap} aria-label="Delivery map" className={cn("overflow-hidden rounded-xl border border-line bg-card shadow-card", className)}>
      <div className="relative isolate bg-surface-2">
        {/* Two fingers move the map, so one thumb can still scroll the page past it. */}
        <Map defaultCenter={centre} defaultZoom={15} mapId={env.mapsMapId} gestureHandling="cooperative" disableDefaultUI clickableIcons={false}
          onTilesLoaded={() => setTiles(true)} className="h-[34vh] max-h-[320px] min-h-[240px] w-full lg:h-[440px] lg:max-h-none">
          {/* Pins, the link and the route go on only once the map has really drawn. On a map Google has
              refused, a marker cannot be removed again without throwing, which took the whole page down
              with it; a map with nothing on it can be swapped for the notice safely. */}
          {tiles ? (
            <>
              {store && customer && !riderAssigned ? <StraightLink from={store} to={customer} /> : null}
              {store ? <AdvancedMarker position={store} title={store.name}><Pin icon={<StoreIcon className="h-4 w-4" />} color={COLORS.store} /></AdvancedMarker> : null}
              {customer ? <AdvancedMarker position={customer} title="Your delivery address"><Pin icon={<Home className="h-4 w-4" />} color={COLORS.customer} /></AdvancedMarker> : null}
              {rider ? <AdvancedMarker position={{ lat: rider.lat, lng: rider.lng }} title="Rider" zIndex={10}><Pin icon={<Bike className="h-4 w-4" />} color={COLORS.rider} pulse={!c.stale} /></AdvancedMarker> : null}
              <FitAndTrail store={store} customer={customer} rider={rider} trail={trail} showRoute={riderAssigned} refit={refit} padding={{ top: 60, bottom: 40, left: 44, right: 44 }} />
            </>
          ) : null}
        </Map>

        {!tiles ? (
          <div role="status" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface-2 px-6 text-center">
            {offline ? <WifiOff className="h-6 w-6 text-ink-3" aria-hidden /> : <span className="h-6 w-6 rounded-full border-2 border-line-2 border-t-brand-600 motion-safe:animate-spin" aria-hidden />}
            <p className="text-sm font-semibold text-ink-2">{offline ? "No internet" : slow ? "Still loading the map…" : "Loading the map…"}</p>
            {offline ? <p className="text-xs text-ink-3">The map loads when you are back online.</p> : slow ? <p className="text-xs text-ink-3">Your connection seems slow. The order status above does not wait for it.</p> : null}
          </div>
        ) : null}

        {/* What each pin is, for the pins that are really on the map. */}
        <ul className="pointer-events-none absolute left-3 top-3 z-[5] flex flex-wrap gap-1.5" aria-label="Map key">
          {[store ? { k: "Store", c: COLORS.store } : null, customer ? { k: "You", c: COLORS.customer } : null, rider ? { k: "Rider", c: COLORS.rider } : null].filter((x): x is { k: string; c: string } => Boolean(x)).map((x) => (
            <li key={x.k} className="flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-semibold text-ink-2 shadow-card">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: x.c }} />{x.k}
            </li>
          ))}
        </ul>

        <button type="button" onClick={() => setRefit((n) => n + 1)} aria-label="Show the whole delivery on the map" title="Show the whole delivery"
          className="tap absolute bottom-3 right-3 z-[5] flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink shadow-float transition-colors duration-150 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
          <LocateFixed className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <CaptionRow c={c} className="p-4" />
    </section>
  );
}

/** No map to show. Says so plainly, and still reports what the points and the rider's last fix tell us. */
function MapUnavailable({ store, customer, rider, riderAssigned, stage, now, className, reason }: Props & { reason: "unavailable" | "no-coordinates" }) {
  const c = caption({ store, customer, rider, riderAssigned, stage, now });
  const dest = customer ?? store;
  const from = rider ? { lat: rider.lat, lng: rider.lng } : store;
  const dirUrl = dest && from && from !== dest ? `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving` : null;
  return (
    <section aria-label="Delivery map" className={cn("rounded-xl border border-dashed border-line-2 bg-card p-4", className)}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-3"><MapPinOff className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug text-ink">{reason === "no-coordinates" ? "No map for this order" : "The map isn't available right now"}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-3">
            {reason === "no-coordinates" ? "This address was saved without a map pin, so there is nothing to place on a map." : "Your order is still tracked: its status and the rider's updates on this screen keep coming in."}
          </p>
        </div>
      </div>
      {/* The caption still holds: it is worked out from the points and the fix, not from the map. */}
      {riderAssigned || reason === "unavailable" ? <CaptionRow c={c} className="mt-3.5 rounded-lg bg-surface p-3" /> : null}
      {dirUrl ? <a href={dirUrl} target="_blank" rel="noreferrer" className="tap mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-brand-700 hover:underline"><Navigation className="h-4 w-4" aria-hidden /> Open the route in Google Maps</a> : null}
    </section>
  );
}
