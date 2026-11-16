"use client";
import * as React from "react";
import { LocateFixed, Search, Loader2, MapPin, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/overlay";
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
type Found = { lat?: number; lng?: number; placeId?: string; title: string; subtitle: string; source: "place" | "area" | "google" | "osm" };
const SOURCE_LABEL = { place: "Merta landmark", area: "Delivery area", google: "Google", osm: "OpenStreetMap" } as const;

/* How far the pin sits from where the phone says the customer is. Shown only when we already have a
   real fix — never guessed, and never a reason to block Confirm (someone may well be ordering for
   their parents' house across town). */
const metresBetween = (a: LatLng, b: LatLng) => {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
/* Rounded to 5 m: a phone fix is not accurate to the metre, so "52 m" would be false precision,
   and inside that margin the honest answer is that the pin is where they are standing. */
const distanceLabel = (m: number) => (m < 25 ? null : m < 950 ? `${Math.round(m / 5) * 5} m` : `${(m / 1000).toFixed(1)} km`);

/**
 * "Select Your Location": a search field, a full-height map with a fixed centre pin ("Order will be
 * delivered here"), and a card attached to the bottom with the address under the pin, how far it is
 * from the customer's own position and Confirm. Outside a delivery zone a red strip sits above the
 * card and Confirm stays disabled. Tapping search opens the "Select Address" sheet over the map.
 * Map data © OpenStreetMap contributors.
 */
export function MapPicker({ initial, onConfirm, confirmLabel = "Confirm & Continue", requireServiceable = true, onManual }: { initial?: LatLng | null; onConfirm: (p: PickedLocation) => void; confirmLabel?: string; /** Block confirming outside delivery zones (customers); admins pinning landmarks pass false. */ requireServiceable?: boolean; /** Offered when location is denied or the map fails: type the address without a pin. */ onManual?: () => void }) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<LMap | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [moving, setMoving] = React.useState(false);
  const [place, setPlace] = React.useState<PickedLocation | null>(null);
  const [serviceable, setServiceable] = React.useState<boolean | null>(null);
  const [looking, setLooking] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Found[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [me, setMe] = React.useState<LatLng | null>(null);
  const lookupSeq = React.useRef(0);
  const searchSeq = React.useRef(0);
  const session = React.useRef("");

  const lookupCtrl = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => lookupCtrl.current?.abort(), []);
  /* Zone check and reverse geocode run side by side; a new pan cancels both. The zone answer (the one
     that gates Confirm) usually lands first; the address text is a convenience that may arrive later or
     not at all, and Confirm never waits for it. */
  const lookup = React.useCallback(async (c: LatLng) => {
    const seq = ++lookupSeq.current;
    lookupCtrl.current?.abort();
    const ctrl = new AbortController(); lookupCtrl.current = ctrl;
    setLooking(true); setServiceable(null); setPlace({ ...c });
    const zone = (async () => {
      try {
        const s = await (await fetch(`/api/location/serviceability?${new URLSearchParams({ lat: String(c.lat), lng: String(c.lng) })}`, { signal: ctrl.signal })).json() as { serviceable: boolean };
        if (seq === lookupSeq.current) setServiceable(Boolean(s.serviceable));
      } catch { if (seq === lookupSeq.current && !ctrl.signal.aborted) setServiceable(null); }
    })();
    const text = (async () => {
      try {
        const d = await (await fetch(`/api/maps/geocode?lat=${c.lat.toFixed(6)}&lng=${c.lng.toFixed(6)}`, { signal: ctrl.signal })).json() as { ok: boolean; formatted?: string; area?: string; pincode?: string; street?: string; city?: string };
        if (seq === lookupSeq.current && d.ok) setPlace({ ...c, area: d.area, pincode: d.pincode, street: d.street, city: d.city, formatted: d.formatted });
      } catch { /* address text is optional */ }
      if (seq === lookupSeq.current) setLooking(false);
    })();
    await Promise.all([zone, text]);
  }, []);

  React.useEffect(() => {
    let cancelled = false; let timer: ReturnType<typeof setTimeout> | undefined;
    loadLeaflet().then((L) => {
      if (cancelled || !boxRef.current) return;
      const start = initial ?? site.center;
      const map = L.map(boxRef.current, { zoomControl: false, attributionControl: true }).setView([start.lat, start.lng], initial ? 17 : 15);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' }).addTo(map);
      map.attributionControl?.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
      map.on("movestart", () => { setMoving(true); clearTimeout(timer); });
      map.on("moveend", () => { setMoving(false); clearTimeout(timer); timer = setTimeout(() => lookup(map.getCenter()), 450); });
      mapRef.current = map; setReady(true);
      setTimeout(() => map.invalidateSize(), 60);
      lookup(map.getCenter());
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; clearTimeout(timer); mapRef.current?.remove(); mapRef.current = null; };
  }, [initial, lookup]);

  /* The distance line needs the customer's own position. Read it without a prompt when the browser
     has already been granted it; otherwise it appears only after they tap the locate button. */
  React.useEffect(() => {
    if (!navigator.geolocation || !window.isSecureContext) return;
    let gone = false;
    navigator.permissions?.query({ name: "geolocation" as PermissionName })
      .then((p) => { if (p.state === "granted" && !gone) navigator.geolocation.getCurrentPosition((pos) => { if (!gone) setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }); }, () => {}, { timeout: 8000, maximumAge: 60000 }); })
      .catch(() => {});
    return () => { gone = true; };
  }, []);

  const locate = () => {
    if (!navigator.geolocation || !window.isSecureContext) { toast.error("Location isn't available here. Search or move the map instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 18);
      setLocating(false);
    }, (err) => {
      toast.error(err.code === err.PERMISSION_DENIED ? "Location permission is blocked. Allow it in your browser settings, search, or enter the address manually." : "Could not get your location. Search, move the map, or enter the address manually.");
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 12000 });
  };

  // Suggestions while typing (debounced); the newest request wins.
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const searchCtrl = React.useRef<AbortController | null>(null);
  const onQuery = (value: string) => {
    setQuery(value);
    clearTimeout(timer.current);
    searchCtrl.current?.abort();
    const term = value.trim();
    const seq = ++searchSeq.current;
    if (term.length < 2) { setResults(null); setSearching(false); return; }
    session.current ||= crypto.randomUUID();
    setSearching(true);
    timer.current = setTimeout(async () => {
      const ctrl = new AbortController(); searchCtrl.current = ctrl;
      try {
        const d = await (await fetch(`/api/maps/search?q=${encodeURIComponent(term)}&session=${session.current}`, { signal: ctrl.signal })).json() as { results: Found[] };
        if (seq === searchSeq.current) setResults(d.results);
      } catch { if (seq === searchSeq.current && !ctrl.signal.aborted) setResults([]); }
      if (seq === searchSeq.current) setSearching(false);
    }, 300);
  };

  const search = (e: React.FormEvent) => { e.preventDefault(); if (results?.[0]) void pick(results[0]); };
  const pick = async (r: Found) => {
    let at = r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;
    if (!at && r.placeId) {
      try {
        const d = await (await fetch(`/api/maps/place?id=${encodeURIComponent(r.placeId)}&session=${session.current}`)).json() as { ok: boolean; lat?: number; lng?: number };
        if (d.ok && d.lat != null && d.lng != null) at = { lat: d.lat, lng: d.lng };
      } catch { /* handled below */ }
    }
    session.current = ""; // a Google session ends with a selection
    if (!at) { toast.error("Couldn't open that place. Try another result or move the map."); return; }
    mapRef.current?.setView([at.lat, at.lng], 17);
    setSearchOpen(false);
  };

  const title = place?.area ?? place?.street ?? place?.city ?? site.city;
  const subtitle = place?.formatted ? place.formatted.split(",").slice(0, 4).join(",") : place ? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}` : "";
  const away = me && place ? metresBetween(me, place) : null;
  const blocked = requireServiceable && serviceable === false && !moving;

  return (
    <div className="flex h-full min-h-[520px] flex-col sm:min-h-0">
      {/* Search field: opens the "Select Address" sheet over the map. */}
      <div className="shrink-0 bg-card px-4 pb-3 pt-1 max-sm:shadow-[0_1px_0_rgb(23_32_28/0.06)] sm:px-0">
        <button type="button" onClick={() => { setQuery(""); setResults(null); setSearchOpen(true); }} className="flex h-12 w-full items-center gap-3 rounded-xl border border-line-2 bg-card px-3.5 text-left text-base text-ink-4 sm:text-[15px]">
          <Search className="h-4 w-4 shrink-0" aria-hidden />Search for apartment, street name…
        </button>
      </div>

      {/* Map + centre pin + the card attached to the bottom. */}
      <div className="relative flex-1 overflow-hidden bg-surface-2 [&_.leaflet-bottom.leaflet-right]:bottom-auto [&_.leaflet-bottom.leaflet-right]:top-0 sm:h-[480px] sm:flex-none sm:rounded-xl sm:border sm:border-line">
        <div ref={boxRef} className="absolute inset-0" />
        {!ready && !failed ? <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-3"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading map…</div> : null}
        {failed ? <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-ink-3">The map couldn&rsquo;t load. You can still continue and type your address.</div> : null}

        {ready ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[400] flex -translate-y-full flex-col items-center">
            <span className={cn("relative mb-2 max-w-[92%] rounded-xl bg-ink px-3.5 py-2 text-center text-white shadow-float transition-opacity", moving && "opacity-0")}>
              <span className="block text-[13px] font-bold">Order will be delivered here</span>
              <span className="block text-[11px] text-white/80">Place the pin at your exact location</span>
              <span aria-hidden className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-ink" />
            </span>
            <svg width="34" height="44" viewBox="0 0 34 44" aria-hidden className={cn("drop-shadow transition-transform duration-150", moving && "-translate-y-2")}>
              <circle cx="17" cy="14" r="12" fill="#329537" stroke="#fff" strokeWidth="3" /><circle cx="17" cy="14" r="4" fill="#fff" />
              <path d="M17 26v14" stroke="#1c5f1f" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        ) : null}
        {ready ? <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[399] h-2 w-5 -translate-x-1/2 rounded-[50%] bg-ink/25" /> : null}

        <div className="absolute inset-x-0 bottom-0 z-[900]">
          <div className="flex justify-end px-3 pb-3">
            <button type="button" onClick={locate} aria-label="Use my current location" className="tap flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-brand-700 shadow-float">
              {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
            </button>
          </div>
          {blocked ? (
            <p role="alert" className="bg-danger-50 px-4 py-2.5 text-center text-sm font-semibold text-[#8a1f18]">We are not serviceable at this location. Please select a different location.</p>
          ) : null}
          <div className="rounded-t-2xl bg-card px-4 pb-[calc(1rem+var(--safe-bottom))] pt-4 shadow-sheet">
            <p className="font-display text-lg font-bold leading-tight text-ink">{looking && !place?.formatted ? (serviceable === null ? "Checking this spot…" : "Finding the address…") : title}</p>
            <p className="mt-0.5 min-h-5 text-sm text-ink-3">{looking && !place?.formatted ? (serviceable === null ? "" : "You can continue; the address text is only a suggestion.") : subtitle}</p>
            {away != null && !moving ? (
              <p className={cn("mt-0.5 text-xs", away > 2000 ? "font-semibold text-danger" : "text-ink-3")}>{distanceLabel(away) ? `Pin is ${distanceLabel(away)} from your current location` : "Pin is where you are standing"}</p>
            ) : null}
            <Button size="lg" fullWidth className="mt-3 h-12 rounded-xl text-base" disabled={!failed && (!place || moving || (requireServiceable && serviceable !== true))} onClick={() => onConfirm(place ?? { ...(initial ?? site.center) })}>{confirmLabel}</Button>
            {onManual ? <button type="button" onClick={onManual} className="tap mt-1 flex min-h-11 w-full items-center justify-center text-sm font-semibold text-brand-700 underline-offset-2 hover:underline">Can&rsquo;t find it? Enter address manually</button> : null}
          </div>
        </div>
      </div>

      {/* "Select Address": search over the map, so closing it puts the pin back where it was. */}
      <BottomSheet open={searchOpen} onClose={() => setSearchOpen(false)} title="Select Address" className="sm:max-w-md">
        <form onSubmit={search} role="search" className="relative pt-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" aria-hidden />
          <input ref={searchRef} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search for apartment, street name…" aria-label="Search for an address" enterKeyHint="search" autoFocus
            className="h-12 w-full rounded-xl border border-line-2 bg-card pl-10 pr-10 text-base text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:text-[15px]" />
          {query ? <button type="button" onClick={() => { onQuery(""); searchRef.current?.focus(); }} aria-label="Clear search" className="tap absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-ink-4"><XCircle className="h-5 w-5" /></button> : null}
        </form>

        <div className="min-h-[7rem] pt-3">
          {results === null ? <p className="flex items-center gap-2 px-1 text-sm text-ink-3">{searching ? <><Loader2 className="h-4 w-4 animate-spin" /> Searching…</> : `Type an area, landmark or street in ${site.city}.`}</p>
            : results.length === 0 && !searching ? <p className="px-1 text-sm text-ink-3">No match for that yet. Close this and move the pin to your spot, or use your current location — the rider follows the pin.</p>
            : (
              <ul className="divide-y divide-dashed divide-line rounded-2xl border border-line bg-card px-4">
                {results.map((r, i) => (
                  <li key={`${r.placeId ?? `${r.lat},${r.lng}`}-${i}`}>
                    <button type="button" onClick={() => pick(r)} className="flex w-full items-start gap-3 py-3.5 text-left">
                      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-ink-3" aria-hidden />
                      <span className="min-w-0"><span className="block font-semibold text-ink">{r.title}</span><span className="block text-xs leading-snug text-ink-3">{r.subtitle}{r.subtitle ? " · " : ""}<span className="text-ink-4">{SOURCE_LABEL[r.source]}</span></span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </BottomSheet>
    </div>
  );
}
