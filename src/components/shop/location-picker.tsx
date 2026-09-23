"use client";
import * as React from "react";
import { MapPin, ChevronDown, LocateFixed, Home, Briefcase, Map as MapIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocationStore } from "@/stores/location-store";
import { BottomSheet } from "@/components/ui/overlay";
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

export function LocationPicker({ addresses = [], className, light }: { addresses?: Address[]; className?: string; light?: boolean }) {
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

  const useGps = () => {
    if (!navigator.geolocation) { setResult({ serviceable: false, message: "Location is not supported on this device." }); return; }
    setBusy("gps");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const s = await check({ lat: String(lat), lng: String(lng) });
      setResult(s);
      if (s.serviceable) { fromServiceability(s, { label: `${s.area ?? s.zone_name} (GPS)`, area: s.area ?? "", pincode: s.pincode ?? "", lat, lng }); setOpen(false); }
      setBusy(null);
    }, () => { setResult({ serviceable: false, message: "We could not access your location. Please allow location permission or enter your pincode." }); setBusy(null); }, { enableHighAccuracy: true, timeout: 10000 });
  };

  const usePin = async () => {
    if (!isValidPincode(pincode)) { setResult({ serviceable: false, message: "Enter a valid 6-digit pincode" }); return; }
    setBusy("pin");
    const s = await check({ pincode });
    setResult(s);
    if (s.serviceable) { fromServiceability(s, { label: `${s.area ?? s.zone_name} · ${pincode}`, area: s.area ?? "", pincode }); setOpen(false); }
    setBusy(null);
  };

  const pickAddress = async (a: Address) => {
    const s = await check(a.lat && a.lng ? { lat: String(a.lat), lng: String(a.lng), pincode: a.pincode } : { pincode: a.pincode });
    setResult(s);
    setLocation({ label: `${a.label ?? a.type[0].toUpperCase() + a.type.slice(1)} · ${a.area}`, area: a.area, pincode: a.pincode, lat: a.lat, lng: a.lng, serviceable: s.serviceable, zoneName: s.zone_name, etaMin: s.eta_min_minutes, etaMax: s.eta_max_minutes, addressId: a.id });
    if (s.serviceable) setOpen(false);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("flex min-w-0 items-center gap-1.5 text-left", className)} aria-label="Change delivery location">
        <MapPin className={cn("h-4.5 w-4.5 shrink-0", light ? "text-saffron-300" : "text-brand-600")} />
        <span className="min-w-0 leading-tight">
          <span className={cn("block text-[11px] font-medium", light ? "text-white/80" : "text-ink-3")}>Delivering to {location?.etaMax ? `· ${location.etaMin}-${location.etaMax} min` : ""}</span>
          <span className={cn("flex items-center gap-0.5 text-sm font-bold", light ? "text-white" : "text-ink")}>
            <span className="truncate">{hydrated && location ? location.label : `${site.city}`}</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </span>
        </span>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Delivery location" description="We currently deliver across Merta City, Rajasthan.">
        <div className="space-y-4 pt-2">
          <Button variant="secondary" fullWidth loading={busy === "gps"} onClick={useGps}><LocateFixed className="h-4 w-4" /> Use my current location</Button>
          <div className="flex gap-2">
            <Input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="Enter pincode (e.g. 341510)" aria-label="Pincode" wrapperClassName="flex-1" />
            <Button variant="primary" loading={busy === "pin"} onClick={usePin}>Check</Button>
          </div>
          {result ? (
            <div className={cn("flex items-start gap-2 rounded-md px-3 py-2.5 text-sm", result.serviceable ? "bg-success-50 text-brand-800" : "bg-danger-50 text-[#8a1f18]")}>
              {result.serviceable ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{result.serviceable ? `Great news! We deliver to ${result.area} in ${result.eta_min_minutes}-${result.eta_max_minutes} minutes.` : result.message}</span>
            </div>
          ) : null}
          {addresses.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Saved addresses</p>
              <ul className="divide-y divide-line rounded-md border border-line">
                {addresses.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => pickAddress(a)} className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-surface">
                      <span className="mt-0.5 text-brand-600">{a.type === "home" ? <Home className="h-4 w-4" /> : a.type === "work" ? <Briefcase className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}</span>
                      <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{a.label ?? a.type[0].toUpperCase() + a.type.slice(1)}</span><span className="line-clamp-1 text-xs text-ink-3">{a.house}, {a.street}, {a.area} – {a.pincode}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-ink-3">Expanding soon to Nagaur, Jodhpur, Ajmer, Pali and Jaipur.</p>
        </div>
      </BottomSheet>
    </>
  );
}
