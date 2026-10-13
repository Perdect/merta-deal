"use client";
import * as React from "react";
import { LocateFixed, Search, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

/* Leaflet is self-hosted under /public/vendor (no CDN, no npm install needed) and loaded only when
   the picker opens. Only the handful of calls below are used, so they are typed locally. */
type LatLng = { lat: number; lng: number };
type LMap = { attributionControl?: { setPrefix: (p: string) => void }; setView: (c: [number, number], z?: number, o?: object) => LMap; getCenter: () => LatLng; getZoom: () => number; on: (e: string, f: () => void) => LMap; remove: () => void; invalidateSize: () => void };
type LeafletGlobal = { map: (el: HTMLElement, o?: object) => LMap; tileLayer: (url: string, o?: object) => { addTo: (m: LMap) => unknown } };
declare global { interface Window { L?: LeafletGlobal } }

const LEAFLET = "/vendor/leaflet-1.9.4";
let loading: Promise<LeafletGlobal> | null = null;
function loadLeaflet(): Promise<LeafletGlobal> {
  if (window.L) return Promise.resolve(window.L);
  loading ??= new Promise((resolve, reject) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = `${LEAFLET}/leaflet.css`; document.head.appendChild(css);
    const js = document.createElement("script"); js.src = `${LEAFLET}/leaflet.js`; js.async = true;
    js.onload = () => (window.L ? resolve(window.L) : reject(new Error("Map failed to load")));
    js.onerror = () => { loading = null; reject(new Error("Map failed to load")); };
    document.head.appendChild(js);
  });
  return loading;
}

export type PickedLocation = LatLng & { area?: string; pincode?: string; street?: string; city?: string; formatted?: string };
type Found = { lat: number; lng: number; title: string; subtitle: string };

/**
 * "Order will be delivered here": the map moves under a fixed centre pin; the address under the pin
 * is looked up when the map stops moving. Search (on submit) and "use my location" move the map.
 * Map data © OpenStreetMap contributors.
 */
export function MapPicker({ initial, onConfirm, confirmLabel = "Confirm & Continue" }: { initial?: LatLng | null; onConfirm: (p: PickedLocation) => void; confirmLabel?: string }) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<LMap | null>(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [moving, setMoving] = React.useState(false);
  const [place, setPlace] = React.useState<PickedLocation | null>(null);
  const [looking, setLooking] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Found[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const lookupSeq = React.useRef(0);

  const lookup = React.useCallback(async (c: LatLng) => {
    const seq = ++lookupSeq.current;
    setLooking(true);
    try {
      const r = await fetch(`/api/maps/geocode?lat=${c.lat.toFixed(6)}&lng=${c.lng.toFixed(6)}`);
      const d = await r.json() as { ok: boolean; formatted?: string; area?: string; pincode?: string; street?: string; city?: string };
      if (seq !== lookupSeq.current) return;
      setPlace(d.ok ? { ...c, area: d.area, pincode: d.pincode, street: d.street, city: d.city, formatted: d.formatted } : { ...c });
    } catch { if (seq === lookupSeq.current) setPlace({ ...c }); }
    if (seq === lookupSeq.current) setLooking(false);
  }, []);

  React.useEffect(() => {
    let cancelled = false; let timer: ReturnType<typeof setTimeout> | undefined;
    loadLeaflet().then((L) => {
      if (cancelled || !boxRef.current) return;
      const start = initial ?? site.center;
      const map = L.map(boxRef.current, { zoomControl: false, attributionControl: true }).setView([start.lat, start.lng], initial ? 17 : 15);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' }).addTo(map);
      map.on("movestart", () => { setMoving(true); clearTimeout(timer); });
      map.on("moveend", () => { setMoving(false); clearTimeout(timer); timer = setTimeout(() => lookup(map.getCenter()), 600); });
      map.attributionControl?.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
      mapRef.current = map; setReady(true);
      setTimeout(() => map.invalidateSize(), 50);
      lookup(map.getCenter());
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; clearTimeout(timer); mapRef.current?.remove(); mapRef.current = null; };
  }, [initial, lookup]);

  const locate = () => {
    if (!navigator.geolocation || !window.isSecureContext) { toast.error("Location isn't available here. Move the map or search instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 18);
      setLocating(false);
    }, (err) => {
      toast.error(err.code === err.PERMISSION_DENIED ? "Location permission is blocked. Allow it in your browser settings, or move the map." : "Could not get your location. Move the map or search instead.");
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 12000 });
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/maps/search?q=${encodeURIComponent(query.trim())}`);
      const d = await r.json() as { results: Found[] };
      setResults(d.results);
    } catch { setResults([]); }
    setSearching(false);
  };

  const title = place?.area ?? place?.street ?? place?.city ?? site.city;
  const subtitle = place?.formatted ? place.formatted.split(",").slice(0, 4).join(",") : place ? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}` : "";

  return (
    <div className="flex flex-col">
      <form onSubmit={search} className="relative" role="search">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" aria-hidden />
        <input value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setResults(null); }} placeholder="Search a new address" aria-label="Search a new address" enterKeyHint="search"
          className="h-12 w-full rounded-xl border border-line-2 bg-card pl-10 pr-24 text-[15px] text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
        <button type="submit" disabled={searching || query.trim().length < 3} className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white disabled:opacity-50">{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}</button>
        {results ? (
          <ul className="absolute inset-x-0 top-full z-[500] mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-card py-1 shadow-float">
            {results.length ? results.map((r) => (
              <li key={`${r.lat},${r.lng}`}>
                <button type="button" onClick={() => { mapRef.current?.setView([r.lat, r.lng], 17); setResults(null); }} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-surface-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{r.title}</span><span className="block truncate text-xs text-ink-3">{r.subtitle}</span></span>
                </button>
              </li>
            )) : <li className="px-3 py-3 text-sm text-ink-3">No match. Move the map to your spot instead.</li>}
          </ul>
        ) : null}
      </form>

      <div className="relative mt-3 h-[min(52dvh,380px)] overflow-hidden rounded-xl border border-line bg-surface-2">
        <div ref={boxRef} className="absolute inset-0" />
        {!ready && !failed ? <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-3"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading map…</div> : null}
        {failed ? <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-ink-3">The map couldn&rsquo;t load. You can still continue and type your address.</div> : null}
        {ready ? (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[400] flex -translate-x-1/2 -translate-y-full flex-col items-center">
            <span className={cn("mb-1 rounded-xl bg-ink px-3 py-2 text-center text-white shadow-float transition-opacity", moving && "opacity-0")}>
              <span className="block text-[13px] font-bold">Order will be delivered here</span>
              <span className="block text-[11px] text-white/80">Place the pin at your exact location</span>
            </span>
            <svg width="34" height="44" viewBox="0 0 34 44" aria-hidden className={cn("drop-shadow transition-transform duration-150", moving && "-translate-y-2")}>
              <circle cx="17" cy="14" r="12" fill="#329537" stroke="#fff" strokeWidth="3" /><circle cx="17" cy="14" r="4" fill="#fff" />
              <path d="M17 26v14" stroke="#1c5f1f" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        ) : null}
        {ready ? <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[399] h-2 w-5 -translate-x-1/2 rounded-[50%] bg-ink/25" /> : null}
        <button type="button" onClick={locate} aria-label="Use my current location" className="tap absolute bottom-3 right-3 z-[450] flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-brand-700 shadow-float">
          {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-line bg-card p-4">
        <p className="font-display text-lg font-bold leading-tight text-ink">{looking && !place ? "Finding address…" : title}</p>
        <p className="mt-0.5 min-h-5 text-sm text-ink-3">{looking ? "Finding address…" : subtitle}</p>
        <Button size="lg" fullWidth className="mt-3 h-12 rounded-xl text-base" disabled={(!place && !failed) || moving} onClick={() => onConfirm(place ?? { ...(initial ?? site.center) })}>{confirmLabel}</Button>
      </div>
    </div>
  );
}
