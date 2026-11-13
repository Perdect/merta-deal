"use client";
import * as React from "react";
import { MapPin, ChevronDown, ChevronRight, Zap, LocateFixed, Home, Briefcase, Map as MapIcon, CheckCircle2, AlertCircle, Plus, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocationStore, adoptAddress, addressLine, addressTitle } from "@/stores/location-store";
import { useAddresses } from "@/stores/me-store";
import { useCheckoutStore } from "@/stores/checkout-store";
import { useCartStore } from "@/stores/cart-store";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";
import type { Address, Serviceability } from "@/types/app";
import { cn } from "@/lib/utils";
import { etaText } from "@/lib/eta";
import { useHydrated } from "@/hooks/use-hydrated";
import { afterOverlayClose } from "@/hooks/use-back-to-close";

async function check(params: Record<string, string>): Promise<Serviceability> {
  const r = await fetch(`/api/location/serviceability?${new URLSearchParams(params)}`);
  return r.json();
}
/** Readable locality for a position ("Sadar Bazaar, Merta City"); null when no geocoder answers. */
async function locality(lat: number, lng: number): Promise<{ label: string; detail?: string; area?: string; pincode?: string } | null> {
  try {
    const d = await (await fetch(`/api/maps/geocode?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`)).json() as { ok: boolean; area?: string; city?: string; pincode?: string; formatted?: string };
    if (!d.ok) return null;
    const label = [d.area, d.city].filter(Boolean).join(", ");
    return label ? { label, detail: d.formatted, area: d.area, pincode: d.pincode } : null;
  } catch { return null; }
}

/**
 * Delivery location in the header. Nothing is assumed: until the customer picks a location it reads
 * "Select delivery location" and no delivery time is shown. The selector offers the browser's
 * position (permission is asked only on that tap), saved addresses, and the address sheet (search, map pin, manual entry). Every choice is checked against the delivery zones
 * (by coordinates when there are any) and the chosen address is the one the cart and checkout use.
 */
export function LocationPicker({ addresses: addressesProp, className, light, variant = "inline", fallbackEta }: {
  /** Saved addresses; by default the ones `/api/me` returned for this customer. */
  addresses?: Address[];
  /** Kept for callers; the selector no longer leaves the page to add an address. */
  signedIn?: boolean;
  className?: string;
  light?: boolean;
  /** "banner" renders the delivery promise above a tappable address pill (mobile brand band). */
  variant?: "inline" | "banner" | "strip";
  /** City-wide ETA from the `settings` table — only used as the general promise copy, never as a confirmed estimate. */
  fallbackEta?: { min: number; max: number };
}) {
  const { location, fromServiceability, setLocation } = useLocationStore();
  const storeAddresses = useAddresses();
  const addresses = addressesProp ?? storeAddresses;
  const setAddressId = useCheckoutStore((s) => s.setAddressId);
  const openSheet = useCartStore((s) => s.openSheet);
  const sp = useSearchParams();
  const [open, setOpen] = React.useState(() => sp.get("pick") === "1");
  const [busy, setBusy] = React.useState<"gps" | "address" | null>(null);
  const [result, setResult] = React.useState<Serviceability | null>(null);
  const hydrated = useHydrated();
  void fallbackEta;

  // The persisted location carries the zone ETA it was saved with, so a changed promise
  // (settings / delivery_zones) would otherwise never reach a returning customer until they
  // re-picked their address. Re-check once per mount; the label and saved address stay put.
  const refreshed = React.useRef(false);
  React.useEffect(() => {
    if (!hydrated || !location || refreshed.current) return;
    refreshed.current = true;
    const hasCoords = location.lat != null && location.lng != null;
    if (!hasCoords && !location.pincode) return;
    const params: Record<string, string> = hasCoords
      ? { lat: String(location.lat), lng: String(location.lng), ...(location.pincode ? { pincode: location.pincode } : {}) }
      : { pincode: location.pincode };
    check(params)
      .then((s) => setLocation({ ...location, serviceable: s.serviceable, zoneName: s.zone_name, etaMin: s.eta_min_minutes, etaMax: s.eta_max_minutes }))
      .catch(() => {});
  }, [hydrated, location, setLocation]);

  const locateMe = () => {
    if (!navigator.geolocation) { setResult({ serviceable: false, message: "Location is not supported on this device. Add an address instead." }); return; }
    // Browsers only expose geolocation on secure origins. Catch it here so the customer is told
    // the real reason rather than being sent to permission settings that cannot help.
    if (!window.isSecureContext) { setResult({ serviceable: false, message: "Location needs a secure (https) connection. Add an address instead." }); return; }
    setBusy("gps");

    const onPosition = async (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      try {
        // Zone by coordinates (never by the default pincode); locality text from the geocoder.
        const [s, place] = await Promise.all([check({ lat: String(lat), lng: String(lng) }), locality(lat, lng)]);
        // A very rough fix (cell-tower level) can land in the wrong zone: say so and offer the map.
        const rough = accuracy > 1500;
        setResult(rough && s.serviceable ? { ...s, message: `Your position is only accurate to about ${Math.round(accuracy / 1000)} km. Confirm it on the map so the rider finds you.` } : s);
        const label = place?.label ?? (s.serviceable ? [s.area, s.city].filter(Boolean).join(", ") : `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        fromServiceability(s, { label, detail: place?.detail, area: place?.area ?? s.area ?? "", pincode: place?.pincode ?? s.pincode ?? "", lat, lng, source: "gps" });
        setAddressId(null);
        if (s.serviceable && !rough) setOpen(false);
      } catch {
        setResult({ serviceable: false, message: "Couldn't check your location. Try again or add an address." });
      } finally {
        setBusy(null);
      }
    };
    // Each failure reason gets its own copy. A denied permission is the only case where the
    // settings advice is true; a timeout or unavailable fix needs a different next step.
    const fail = async (err: GeolocationPositionError) => {
      let message =
        err.code === err.POSITION_UNAVAILABLE ? "We couldn't work out where you are right now. Pick the spot on the map or type your address."
        : "Finding your location is taking too long. Pick the spot on the map or type your address.";
      if (err.code === err.PERMISSION_DENIED) {
        // Browsers report "site blocked" and "location off for the whole browser/device" the same way.
        // The Permissions API tells them apart, so the customer gets the fix that actually applies.
        const state = await navigator.permissions?.query({ name: "geolocation" }).then((p) => p.state).catch(() => null);
        message = state === "denied"
          ? "Location is blocked for this site. Tap the lock icon next to the web address, set Location to Allow, then tap Enable again. Or pick your spot on the map."
          : "Location is turned off for your browser. Turn on Location in your phone or computer settings, then tap Enable again. Or pick your spot on the map.";
      }
      setResult({ serviceable: false, message });
      setBusy(null);
    };
    // High accuracy first; laptops and many budget phones have no GPS fix and time out, so
    // retry once with a coarse (network) position before giving up.
    navigator.geolocation.getCurrentPosition(onPosition, (err) => {
      if (err.code === err.TIMEOUT) {
        navigator.geolocation.getCurrentPosition(onPosition, fail, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
        return;
      }
      fail(err);
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  // Delivery time only once the location is a real, served one; never a default.
  const verified = hydrated && location?.serviceable && location.etaMax;
  const etaLabel = verified ? etaText(location.etaMin, location.etaMax, variant === "banner" ? "minutes" : "min") : null;
  const title = !hydrated || !location ? "Select delivery location" : location.serviceable ? (etaLabel ? `Delivery in ${etaLabel}` : `Delivering to ${location.label}`) : "Not delivering here yet";
  const line = hydrated && location ? location.label : "See delivery time & availability";

  const pickAddress = async (a: Address) => {
    if (busy) return;
    setBusy("address");
    try {
      const s = await adoptAddress(a);
      setAddressId(a.id); // the cart and checkout deliver here too
      setResult(s);
      if (s.serviceable) setOpen(false);
    } catch {
      // Offline or the API is unreachable: say so instead of silently doing nothing.
      setResult({ serviceable: false, message: "Couldn't check this address. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  };
  // Closing this dialog pops its history entry asynchronously; opening the sheet in the same tick would be
  // undone by that pop (the sheet closed itself at once), so the sheet opens once the pop has landed.
  const addNew = () => { setOpen(false); afterOverlayClose(() => openSheet("address")); };

  return (
    <>
      {variant === "strip" ? (
        /* One-line bar for the product page: "⚡ 20–25 min • Sadar Bazaar, Merta City ⌄". */
        <button type="button" onClick={() => setOpen(true)} aria-label="Change delivery location" className={cn("tap flex min-w-0 max-w-full items-center gap-1.5 text-left text-sm", className)}>
          <Zap className={cn("h-4 w-4 shrink-0", etaLabel ? "fill-fresh text-fresh" : "text-ink-4")} />
          {etaLabel ? <><span className="shrink-0 font-bold text-brand-700">{etaLabel}</span><span className="text-ink-4">•</span></> : null}
          <span className="truncate font-semibold text-ink">{hydrated && location ? location.label : "Select delivery location"}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" />
        </button>
      ) : (
      <button type="button" onClick={() => setOpen(true)} aria-label={`Delivery location: ${line}. Change`} className={cn("block min-w-0 max-w-full text-left", className)}>
        <span className={cn("block truncate font-display leading-tight", variant === "banner" ? "text-[22px] font-extrabold tracking-[-0.01em]" : "text-[15px] font-bold", light ? "text-white" : "text-ink")}>{title}</span>
        <span className={cn("flex items-center gap-1.5 font-medium", variant === "banner" ? "mt-0.5 text-[14px] text-ink-2" : "mt-0.5 text-xs text-ink-3", light && "text-white/85")}>
          {variant === "banner" ? null : <MapPin className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{variant === "banner" ? (hydrated && location ? (location.detail ?? location.label) : line) : line}</span>
          {variant === "banner" ? <span aria-hidden className="shrink-0 text-[11px] leading-none text-ink">▼</span> : <ChevronDown className="h-4 w-4 shrink-0" />}
        </span>
      </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Select delivery location" size="md" className="sm:max-w-lg">
        <div className="-mx-5 -mb-5 bg-surface px-5 pb-5 pt-2">
          <div className="divide-y divide-line rounded-2xl border border-line bg-card">
            <div className="flex items-center gap-4 p-4">
              <LocateFixed className="h-7 w-7 shrink-0 text-brand-700" strokeWidth={1.5} />
              <div className="min-w-0 flex-1"><p className="text-base font-bold text-brand-700">Use my current location</p><p id="loc-gps-hint" className="text-sm text-ink-3">We ask for location permission only when you tap Enable</p></div>
              <Button variant="outline" size="md" className="rounded-lg border-brand-600 px-4 text-brand-700" loading={busy === "gps"} disabled={busy !== null} onClick={locateMe} aria-describedby="loc-gps-hint">Enable</Button>
            </div>
            <button type="button" onClick={addNew} className="flex w-full items-center gap-4 p-4 text-left hover:bg-surface focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-600">
              <Plus className="h-7 w-7 shrink-0 text-brand-700" strokeWidth={1.5} aria-hidden />
              <span className="min-w-0 flex-1"><span className="block text-base font-bold text-brand-700">Add new address</span><span className="block text-sm text-ink-3">Search, pin on the map, or type it</span></span>
              <ChevronRight className="h-5 w-5 text-ink-3" aria-hidden />
            </button>
          </div>

          <div role="status" aria-live="polite">
            {result ? (
              <div className={cn("mt-4 rounded-xl px-3 py-2.5 text-sm", result.serviceable ? "bg-success-50 text-brand-800" : "bg-danger-50 text-[#8a1f18]")}>
                <div className="flex items-start gap-2">
                  {result.serviceable ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                  <span>{result.serviceable ? (result.message ?? `Great news! We deliver to ${result.area} in ${etaText(result.eta_min_minutes, result.eta_max_minutes, "minutes")}.`) : result.message}</span>
                </div>
                <button type="button" onClick={addNew} className="mt-2 inline-flex min-h-9 items-center gap-1 text-sm font-bold underline-offset-2 hover:underline"><MapIcon className="h-4 w-4" aria-hidden /> {result.serviceable ? "Confirm on the map" : "Pick on the map or type your address"}</button>
              </div>
            ) : null}
          </div>

          {hydrated && location ? (
            <p className="mt-4 flex items-center gap-2 text-xs text-ink-3"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">Now: <span className="font-semibold text-ink-2">{location.detail ?? location.label}</span>{location.serviceable ? "" : " (outside our delivery area)"}</span></p>
          ) : null}

          {addresses.length ? (
            <div className="mt-5">
              <h3 className="font-display text-lg font-bold text-ink">Saved addresses</h3>
              <ul className="mt-3 divide-y divide-dashed divide-line-2 rounded-2xl border border-line bg-card">
                {addresses.map((a) => {
                  const on = hydrated && location?.addressId === a.id;
                  return (
                  <li key={a.id}>
                    <button type="button" onClick={() => pickAddress(a)} disabled={busy !== null} aria-pressed={on} className="flex w-full items-start gap-4 px-4 py-4 text-left hover:bg-surface focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-60">
                      <span className={cn("mt-0.5 shrink-0", on ? "text-brand-700" : "text-ink-2")} aria-hidden="true">{busy === "address" && on ? <Loader2 className="h-6 w-6 animate-spin" /> : a.type === "home" ? <Home className="h-6 w-6" strokeWidth={1.5} /> : a.type === "work" ? <Briefcase className="h-6 w-6" strokeWidth={1.5} /> : <MapIcon className="h-6 w-6" strokeWidth={1.5} />}</span>
                      <span className="min-w-0"><span className="block text-base font-bold text-ink">{addressTitle(a)}{on ? <span className="ml-2 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700">Selected</span> : null}</span><span className="line-clamp-2 text-sm text-ink-2">{addressLine(a)}</span></span>
                    </button>
                  </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <p className="mt-4 text-xs text-ink-3">We currently deliver across {site.city}, Rajasthan.</p>
        </div>
      </Modal>
    </>
  );
}
