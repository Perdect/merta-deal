"use client";
import * as React from "react";
import Link from "next/link";
import { MapPin, ChevronDown, ChevronRight, Zap, LocateFixed, Home, Briefcase, Map as MapIcon, CheckCircle2, AlertCircle, Search, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocationStore } from "@/stores/location-store";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { site } from "@/config/site";
import type { Address, Serviceability } from "@/types/app";
import { cn, isValidPincode } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";

async function check(params: Record<string, string>): Promise<Serviceability> {
  const r = await fetch(`/api/location/serviceability?${new URLSearchParams(params)}`);
  return r.json();
}

export function LocationPicker({ addresses = [], className, light, variant = "inline", fallbackEta, signedIn = false }: {
  addresses?: Address[];
  /** Where "Add New Address" goes: the address book, or sign-in first. */
  signedIn?: boolean;
  className?: string;
  light?: boolean;
  /** "banner" renders the delivery promise above a tappable address pill (mobile brand band). */
  variant?: "inline" | "banner" | "strip";
  /** City-wide ETA from the `settings` table, used until a zone-specific one resolves. */
  fallbackEta?: { min: number; max: number };
}) {
  const { location, fromServiceability, setLocation } = useLocationStore();
  const sp = useSearchParams();
  const [open, setOpen] = React.useState(() => sp.get("pick") === "1");
  const [pincode, setPincode] = React.useState("");
  const [busy, setBusy] = React.useState<"gps" | "pin" | null>(null);
  const [result, setResult] = React.useState<Serviceability | null>(null);
  const hydrated = useHydrated();

  React.useEffect(() => {
    if (!hydrated || location) return;
    // Default to the launch city so browsing works before the customer picks a precise location.
    check({ pincode: site.defaultPincode }).then((s) => fromServiceability(s, { label: `${site.city} · ${site.defaultPincode}`, area: site.city, pincode: site.defaultPincode })).catch(() => {});
  }, [hydrated, location, fromServiceability]);

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
    if (!navigator.geolocation) { setResult({ serviceable: false, message: "Location is not supported on this device. Enter your pincode instead." }); return; }
    // Browsers only expose geolocation on secure origins. Catch it here so the customer is told
    // the real reason rather than being sent to permission settings that cannot help.
    if (!window.isSecureContext) { setResult({ serviceable: false, message: "Location needs a secure (https) connection. Enter your pincode instead." }); return; }
    setBusy("gps");

    const onPosition = async (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      try {
        const s = await check({ lat: String(lat), lng: String(lng) });
        setResult(s);
        if (s.serviceable) { fromServiceability(s, { label: `Current location · ${s.pincode ?? s.city ?? site.city}`, area: s.area ?? "", pincode: s.pincode ?? "", lat, lng }); setOpen(false); }
      } catch {
        setResult({ serviceable: false, message: "Couldn't check your location. Try again or enter your pincode." });
      } finally {
        setBusy(null);
      }
    };
    // Each failure reason gets its own copy. A denied permission is the only case where the
    // settings advice is true; a timeout or unavailable fix needs a different next step.
    const fail = async (err: GeolocationPositionError) => {
      let message =
        err.code === err.POSITION_UNAVAILABLE ? "We couldn't work out where you are right now. Enter your pincode instead."
        : "Finding your location is taking too long. Enter your pincode instead.";
      if (err.code === err.PERMISSION_DENIED) {
        // Browsers report "site blocked" and "location off for the whole browser/device" the same way.
        // The Permissions API tells them apart, so the customer gets the fix that actually applies.
        const state = await navigator.permissions?.query({ name: "geolocation" }).then((p) => p.state).catch(() => null);
        message = state === "denied"
          ? "Location is blocked for this site. Tap the lock icon next to the web address, set Location to Allow, then tap Enable again. Or enter your pincode."
          : "Location is turned off for your browser. Turn on Location in your phone or computer settings, then tap Enable again. Or enter your pincode.";
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

  const checkPin = async () => {
    if (!isValidPincode(pincode)) { setResult({ serviceable: false, message: "Enter a valid 6-digit pincode" }); return; }
    setBusy("pin");
    try {
      const s = await check({ pincode });
      setResult(s);
      if (s.serviceable) { fromServiceability(s, { label: `${s.city ?? site.city} · ${pincode}`, area: s.area ?? "", pincode }); setOpen(false); }
    } catch {
      setResult({ serviceable: false, message: "Couldn't check this pincode. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  };

  // Zone ETA once the location resolves, else the city-wide setting. Never hardcoded,
  // and never two competing numbers on screen at once.
  const eta = hydrated && location?.etaMax ? { min: location.etaMin ?? location.etaMax, max: location.etaMax } : fallbackEta;
  const etaLabel = eta ? `${eta.min}–${eta.max} min` : null;

  const pickAddress = async (a: Address) => {
    const s = await check(a.lat && a.lng ? { lat: String(a.lat), lng: String(a.lng), pincode: a.pincode } : { pincode: a.pincode });
    setResult(s);
    setLocation({ label: `${a.label ?? a.type[0].toUpperCase() + a.type.slice(1)} · ${a.area}`, area: a.area, pincode: a.pincode, lat: a.lat, lng: a.lng, serviceable: s.serviceable, zoneName: s.zone_name, etaMin: s.eta_min_minutes, etaMax: s.eta_max_minutes, addressId: a.id });
    if (s.serviceable) setOpen(false);
  };

  return (
    <>
      {variant === "strip" ? (
        /* One-line bar for the product page: "⚡ 20–25 min • Merta City · 341510 ⌄". */
        <button type="button" onClick={() => setOpen(true)} aria-label="Change delivery location" className={cn("tap flex min-w-0 max-w-full items-center gap-1.5 text-left text-sm", className)}>
          <Zap className="h-4 w-4 shrink-0 fill-fresh text-fresh" />
          {etaLabel ? <span className="shrink-0 font-bold text-brand-700">{etaLabel}</span> : null}
          <span className="text-ink-4">•</span>
          <span className="truncate font-semibold text-ink">{hydrated && location ? location.label : "Select location"}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" />
        </button>
      ) : (
      <button type="button" onClick={() => setOpen(true)} aria-label="Change delivery location" className={cn("block min-w-0 max-w-full text-left", className)}>
        <span className={cn("block truncate font-display font-bold leading-tight", variant === "banner" ? "text-[17px]" : "text-[15px]", light ? "text-white" : "text-ink")}>
          {etaLabel ? `Delivery in ${etaLabel}` : `Delivery across ${site.city}`}
        </span>
        <span className={cn("mt-0.5 flex items-center gap-1 font-medium", variant === "banner" ? "text-[13px]" : "text-xs", light ? "text-white/85" : "text-ink-3")}>
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{hydrated && location ? location.label : "Select location"}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </span>
      </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Your Location" size="md" className="sm:max-w-lg">
        <div className="-mx-5 -mb-5 bg-surface px-5 pb-5 pt-2">
          <form onSubmit={(e) => { e.preventDefault(); checkPin(); }} className="flex gap-2">
            <Input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="Search by pincode (e.g. 341510)" aria-label="Pincode" leftIcon={<Search className="h-4 w-4" />} className="h-12 bg-card" wrapperClassName="flex-1" />
            <Button type="submit" variant="primary" className="h-12 rounded-xl" loading={busy === "pin"}>Check</Button>
          </form>

          <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-card">
            <div className="flex items-center gap-4 p-4">
              <LocateFixed className="h-7 w-7 shrink-0 text-brand-700" strokeWidth={1.5} />
              <div className="min-w-0 flex-1"><p className="text-base font-bold text-brand-700">Use My Current Location</p><p className="text-sm text-ink-3">Enable your current location for better services</p></div>
              <Button variant="outline" size="sm" className="rounded-lg border-brand-600 text-brand-700" loading={busy === "gps"} onClick={locateMe}>Enable</Button>
            </div>
            <Link href={signedIn ? "/account/addresses?new=1" : `/login?next=${encodeURIComponent("/account/addresses?new=1")}`} onClick={() => setOpen(false)} className="flex items-center gap-4 p-4 hover:bg-surface">
              <Plus className="h-7 w-7 shrink-0 text-brand-700" strokeWidth={1.5} />
              <span className="flex-1 text-base font-bold text-brand-700">Add New Address</span>
              <ChevronRight className="h-5 w-5 text-ink-3" />
            </Link>
          </div>

          {result ? (
            <div className={cn("mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm", result.serviceable ? "bg-success-50 text-brand-800" : "bg-danger-50 text-[#8a1f18]")}>
              {result.serviceable ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{result.serviceable ? `Great news! We deliver to ${result.area} in ${result.eta_min_minutes}-${result.eta_max_minutes} minutes.` : result.message}</span>
            </div>
          ) : null}

          {addresses.length ? (
            <div className="mt-5">
              <h3 className="font-display text-lg font-bold text-ink">Saved Addresses</h3>
              <ul className="mt-3 divide-y divide-dashed divide-line-2 rounded-2xl border border-line bg-card">
                {addresses.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => pickAddress(a)} className="flex w-full items-start gap-4 px-4 py-4 text-left hover:bg-surface">
                      <span className="mt-0.5 shrink-0 text-ink-2">{a.type === "home" ? <Home className="h-6 w-6" strokeWidth={1.5} /> : a.type === "work" ? <Briefcase className="h-6 w-6" strokeWidth={1.5} /> : <MapIcon className="h-6 w-6" strokeWidth={1.5} />}</span>
                      <span className="min-w-0"><span className="block text-base font-bold text-ink">{a.label ?? a.type[0].toUpperCase() + a.type.slice(1)}</span><span className="line-clamp-2 text-sm text-ink-2">{[a.house, a.street, a.area, a.landmark, `${a.city} – ${a.pincode}`].filter(Boolean).join(", ")}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-4 text-xs text-ink-3">We currently deliver across {site.city}, Rajasthan. Expanding soon to Nagaur.</p>
        </div>
      </Modal>
    </>
  );
}
