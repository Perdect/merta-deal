"use client";
import * as React from "react";
import { LocateFixed, MapPin, Map as MapIcon, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { saveAddressAction, type AddressInput } from "@/lib/actions/checkout";
import type { Address, Serviceability } from "@/types/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { site } from "@/config/site";
import { etaText } from "@/lib/eta";
import { addressFields } from "@/lib/destinations";

export type AddressDraft = AddressInput;

/**
 * Address details first: house, area, receiver and phone. Nothing else to choose. City and pincode are fixed to Merta City (one city, one pincode), so the
 * delivery zone comes from the pin when there is one, else from the city default. Saving needs no map and no GPS: the server checks the
 * delivery zone (by pin when there is one, else by pincode) inside the save, so nothing we cannot
 * deliver to is ever stored, and a failed check comes back as a message on this form.
 *
 * Optional shortcuts: "Use current location" pins the browser's position and fills empty fields from
 * the geocoder in the background (typing continues meanwhile; a slow geocoder is simply abandoned),
 * and "Choose on map" hands the current draft to the map picker for a precise pin.
 */
export function AddressForm({ initial, onSaved, onCancel, defaultName, defaultPhone, onChooseMap, pinLabel }: { initial?: Partial<Address>; onSaved: (a: Address) => void; onCancel?: () => void; defaultName?: string | null; defaultPhone?: string | null; onChooseMap?: (draft: AddressDraft) => void; /** What the map called the pinned spot (area, street or place name), when it gave one. */ pinLabel?: string | null }) {
  const [form, setForm] = React.useState<AddressInput>({
    id: initial?.id, type: initial?.type ?? "home", label: initial?.label ?? "", full_name: initial?.full_name ?? defaultName ?? "", phone: initial?.phone ?? defaultPhone ?? "",
    house: initial?.house ?? "", street: initial?.street ?? "", area: initial?.area ?? "", landmark: initial?.landmark ?? "", city: site.city, pincode: site.defaultPincode,
    lat: initial?.lat ?? null, lng: initial?.lng ?? null, is_default: initial?.is_default ?? false,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [areaError, setAreaError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [locating, setLocating] = React.useState<"gps" | "address" | null>(null);
  const set = (k: keyof AddressInput, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  // A "Guest" placeholder name is not a receiver's name.
  const nameValue = form.full_name === "Guest" ? "" : form.full_name;
  const pinned = form.lat != null && form.lng != null;
  // The delivery line names the customer's own spot: the area they typed, else what the map or GPS lookup called the pin.
  const [pinPlace, setPinPlace] = React.useState<string | null>(pinLabel?.trim() || null);
  const chosenPlace = (form.area ?? "").trim() || pinPlace;

  /* Early delivery-area feedback while typing (debounced, newest request wins). It never blocks typing
     or saving: the save itself is checked again on the server, which is the only check that counts. */
  const [zoneResult, setZoneResult] = React.useState<{ key: string; state: "checking" | "ok" | "no" | "unknown"; info?: Serviceability } | null>(null);
  const zoneKey = pinned ? `${form.lat},${form.lng}|${form.pincode}` : "";
  // Only the answer for what is typed now is shown; an older answer simply stops matching.
  const zone = zoneResult && zoneResult.key === zoneKey ? zoneResult : null;
  React.useEffect(() => {
    if (!zoneKey) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setZoneResult({ key: zoneKey, state: "checking" });
      const [coords, pincode] = zoneKey.split("|");
      const q = new URLSearchParams(coords ? { lat: coords.split(",")[0], lng: coords.split(",")[1], pincode } : { pincode });
      try {
        const s = (await (await fetch(`/api/location/serviceability?${q}`, { signal: ctrl.signal })).json()) as Serviceability;
        setZoneResult({ key: zoneKey, state: s.serviceable ? "ok" : "no", info: s });
        if (s.serviceable) setAreaError(null);
      } catch { if (!ctrl.signal.aborted) setZoneResult({ key: zoneKey, state: "unknown" }); }
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [zoneKey]);

  const geocodeRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => geocodeRef.current?.abort(), []);
  const locate = () => {
    if (!navigator.geolocation) { toast.error("Location is not supported on this device", "Type the address instead."); return; }
    if (!window.isSecureContext) { toast.error("Location needs a secure (https) connection", "Type the address instead."); return; }
    setLocating("gps");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      setForm((f) => ({ ...f, lat, lng }));
      setLocating("address");
      // The pin is set; the address text is a suggestion that arrives when the geocoder answers, filling only fields still empty.
      geocodeRef.current?.abort();
      const ctrl = new AbortController(); geocodeRef.current = ctrl;
      const timeout = setTimeout(() => ctrl.abort(), 6000);
      try {
        const d = await (await fetch(`/api/maps/geocode?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`, { signal: ctrl.signal })).json() as { ok: boolean; area?: string; pincode?: string; street?: string; formatted?: string; source?: string };
        if (d.ok) {
          setPinPlace(d.area ?? d.street ?? d.formatted?.split(",")[0]?.trim() ?? null);
          setForm((f) => ({ ...f, area: f.area || d.area || f.area, street: f.street || d.street || f.street }));
          toast.success("Location pinned", d.source === "osm" ? "Area suggested from OpenStreetMap. Check it before saving." : "Check the suggested area before saving.");
        } else toast.info("Location pinned", "Type your house and area details.");
      } catch { if (!ctrl.signal.aborted || geocodeRef.current === ctrl) toast.info("Location pinned", "The address lookup is slow; type your house and area details."); }
      finally { clearTimeout(timeout); if (geocodeRef.current === ctrl) { geocodeRef.current = null; setLocating(null); } }
    }, (err) => {
      toast.error(err.code === err.PERMISSION_DENIED ? "Location permission is blocked. You can still type the address, or choose it on the map." : "Could not get your location. Type the address or choose it on the map.");
      setLocating(null);
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
  };

  // Every address is a home address (the destination selector was dropped): type "home", no label.
  const draft = (): AddressDraft => ({ ...form, ...addressFields("home", ""), full_name: nameValue });

  // Typed values stay in `form` whatever the outcome: a failed save only adds field errors. `busy`
  // blocks a second submit (Enter + tap) while the first is in flight, and a network failure
  // (server actions reject when offline) is reported instead of leaving the button spinning.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErrors({}); setAreaError(null);
    try {
      const r = await saveAddressAction(draft());
      if (!r.ok) {
        if (r.outsideArea) { setAreaError(r.error); return; }
        setErrors(r.fieldErrors ?? {}); toast.error(r.error); return;
      }
      toast.success("Address saved"); onSaved(r.data);
    } catch {
      toast.error("Could not save the address", "Check your connection and try again. Nothing you typed was lost.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="House / Flat / Shop no." required value={form.house} onChange={(e) => set("house", e.target.value)} error={errors.house} placeholder="e.g. 12, First floor" autoComplete="address-line1" />
        <Input label={pinned ? "Area / Colony (optional)" : "Area / Colony"} required={!pinned} value={form.area ?? ""} onChange={(e) => set("area", e.target.value)} error={errors.area} placeholder="e.g. Sadar Bazaar" autoComplete="address-level3" />
        <Input label="Receiver's name" required value={nameValue} onChange={(e) => set("full_name", e.target.value)} error={errors.full_name} autoComplete="name" hint="Ordering for someone else? Enter their name and number." />
        <Input label="Mobile number" required inputMode="numeric" value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} error={errors.phone} autoComplete="tel-national" placeholder="10-digit number" hint="The rider calls this number." />
        <div className="space-y-1.5"><p className="text-sm font-medium text-ink-2">City</p><p className="flex h-11 items-center rounded-sm border border-line bg-surface-2 px-3.5 text-sm text-ink-2">{site.city}, Rajasthan</p></div>
      </div>

      {zone ? (
        <p role="status" aria-live="polite" className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-sm", zone.state === "ok" ? "bg-success-50 text-brand-800" : zone.state === "no" ? "bg-danger-50 text-[#8a1f18]" : "bg-surface-2 text-ink-3")}>
          {zone.state === "checking" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden /> : zone.state === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <span>{zone.state === "checking" ? "Checking delivery area…" : zone.state === "ok" ? `We deliver to ${chosenPlace ?? "this location"}${zone.info?.eta_max_minutes ? ` in ${etaText(zone.info.eta_min_minutes, zone.info.eta_max_minutes, "minutes")}` : ""}.` : zone.state === "no" ? (zone.info?.message ?? "This pincode is outside our delivery area.") : "Couldn't check the delivery area yet; you can still save and we check again."}</span>
        </p>
      ) : null}

      <div className="rounded-lg border border-line bg-surface px-3 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink"><MapPin className={cn("h-4 w-4", pinned ? "text-brand-700" : "text-ink-4")} aria-hidden />{pinned ? "Location pinned for the rider" : "Exact spot for the rider (optional)"}</p>
        <p className="mt-0.5 text-xs text-ink-3">{pinned ? "The rider navigates to this pin. The address above is what they read." : "Without a pin the rider goes by the address. A pin helps in lanes and new colonies."}</p>
        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" loading={locating === "gps"} disabled={locating !== null} onClick={locate}><LocateFixed className="h-4 w-4" /> {locating === "address" ? "Finding address…" : pinned ? "Update from GPS" : "Use current location"}</Button>
          {onChooseMap ? <Button type="button" variant="outline" onClick={() => onChooseMap(draft())}><MapIcon className="h-4 w-4" /> {pinned ? "Change on map" : "Choose on map"}</Button> : null}
        </div>
      </div>

      {areaError ? <div role="alert"><Alert tone="danger" title="Outside our delivery area">{areaError} We deliver within {site.city} only.</Alert></div> : null}
      <div className="flex gap-2">
        {onCancel ? <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="flex-1">Cancel</Button> : null}
        <Button type="submit" size="lg" loading={busy} disabled={busy} className="flex-1">{busy ? "Saving…" : "Save address"}</Button>
      </div>
    </form>
  );
}
