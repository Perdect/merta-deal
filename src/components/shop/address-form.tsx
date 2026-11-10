"use client";
import * as React from "react";
import { LocateFixed, Home, Briefcase, Hotel, MapPin } from "lucide-react";
import { saveAddressAction, type AddressInput } from "@/lib/actions/checkout";
import type { Address, Serviceability } from "@/types/app";
import { Button } from "@/components/ui/button";
import { Input, Checkbox } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { site } from "@/config/site";
import { addressFields, composePlace, destinationOf, parsePlace, DESTINATION_LABEL, type Destination } from "@/lib/destinations";

const TYPES: { v: Destination; icon: typeof Home }[] = [{ v: "home", icon: Home }, { v: "office", icon: Briefcase }, { v: "hotel", icon: Hotel }, { v: "other", icon: MapPin }];

/**
 * Address details: destination (Home, Office, Hotel, Other), house or hotel / company details, street or
 * area, optional landmark, receiver and phone. Before saving, the address is checked against the delivery zones (by pin, else by pincode)
 * so an address we cannot deliver to is never saved as the delivery address.
 */
export function AddressForm({ initial, onSaved, onCancel, defaultName, defaultPhone }: { initial?: Partial<Address>; onSaved: (a: Address) => void; onCancel?: () => void; defaultName?: string | null; defaultPhone?: string | null }) {
  const [form, setForm] = React.useState<AddressInput>({
    id: initial?.id, type: initial?.type ?? "home", label: initial?.label ?? "", full_name: initial?.full_name ?? defaultName ?? "", phone: initial?.phone ?? defaultPhone ?? "",
    house: initial?.house ?? "", street: initial?.street ?? "", area: initial?.area ?? "", landmark: initial?.landmark ?? "", city: initial?.city ?? site.city, pincode: initial?.pincode ?? site.defaultPincode,
    lat: initial?.lat ?? null, lng: initial?.lng ?? null, is_default: initial?.is_default ?? false,
  });
  const [dest, setDest] = React.useState<Destination>(destinationOf(initial ?? {}));
  const [place, setPlace] = React.useState(() => (destinationOf(initial ?? {}) === "hotel" || destinationOf(initial ?? {}) === "office" ? parsePlace(initial?.house) : { name: "", detail: "", reception: false }));
  const isPlace = dest === "hotel" || dest === "office";
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [areaError, setAreaError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const set = (k: keyof AddressInput, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  // A "Guest" placeholder name is not a receiver's name.
  const nameValue = form.full_name === "Guest" ? "" : form.full_name;

  const locate = () => {
    if (!navigator.geolocation) { toast.error("Location is not supported on this device"); return; }
    if (!window.isSecureContext) { toast.error("Location needs a secure (https) connection"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      set("lat", pos.coords.latitude); set("lng", pos.coords.longitude);
      try {
        const r = await fetch(`/api/maps/geocode?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
        const d = await r.json();
        if (d.ok) { if (d.area && !form.area) set("area", d.area); if (d.pincode) set("pincode", d.pincode); toast.success("Location pinned and address suggested", d.source === "osm" ? "Address data © OpenStreetMap contributors. Please check it." : "Please check it before saving."); }
        else toast.info("Location pinned", "Please type your house and area details.");
      } catch { toast.info("Location pinned", "Please type your house and area details."); }
      setLocating(false);
    }, (err) => {
      toast.error(err.code === err.PERMISSION_DENIED ? "Location permission is blocked. You can still type the address below." : "Could not get your location. Type the address instead.");
      setLocating(false);
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
  };

  /** Delivery-area check (the same zone lookup the cart and place_order use). Null = could not check. */
  const checkArea = async (): Promise<Serviceability | null> => {
    const q = new URLSearchParams(form.lat != null && form.lng != null ? { lat: String(form.lat), lng: String(form.lng), pincode: String(form.pincode) } : { pincode: String(form.pincode) });
    try { return (await (await fetch(`/api/location/serviceability?${q}`)).json()) as Serviceability; } catch { return null; }
  };

  // Typed values stay in `form` whatever the outcome: a failed save only adds field errors. `busy`
  // blocks a second submit (Enter + tap) while the first is in flight, and a network failure
  // (server actions reject when offline) is reported instead of leaving the button spinning.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErrors({}); setAreaError(null);
    try {
      if (!/^[1-9][0-9]{5}$/.test(String(form.pincode))) { setErrors({ pincode: "Enter a valid 6-digit pincode" }); return; }
      if (isPlace && !place.name.trim()) { setErrors({ house: dest === "hotel" ? "Enter the hotel name" : "Enter the company name" }); return; }
      const area = await checkArea();
      if (area && !area.serviceable) {
        setAreaError(area.message ?? `Sorry, ${site.name} doesn't deliver to this address yet.`);
        return;
      }
      const r = await saveAddressAction({ ...form, ...addressFields(dest, form.label ?? ""), house: isPlace ? composePlace(place) : form.house, full_name: nameValue });
      if (!r.ok) { setErrors(r.fieldErrors ?? {}); toast.error(r.error); return; }
      toast.success("Address saved"); onSaved(r.data);
    } catch {
      toast.error("Could not save the address", "Check your connection and try again. Nothing you typed was lost.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Delivering to">
        {TYPES.map(({ v, icon: Icon }) => (
          <button key={v} type="button" aria-pressed={dest === v} onClick={() => setDest(v)} className={cn("flex h-11 items-center justify-center gap-1.5 rounded-sm border text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600", dest === v ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-2 bg-card text-ink-2")}><Icon className="h-4 w-4 shrink-0 max-[359px]:hidden" aria-hidden />{DESTINATION_LABEL[v]}</button>
        ))}
      </div>
      <Button type="button" variant="secondary" fullWidth loading={locating} onClick={locate}><LocateFixed className="h-4 w-4" /> {form.lat ? "Location pinned · Update GPS" : "Use current location (GPS)"}</Button>
      <div className="grid gap-3 sm:grid-cols-2">
        {isPlace ? (
          <>
            <Input label={dest === "hotel" ? "Hotel name" : "Company name"} required value={place.name} onChange={(e) => setPlace({ ...place, name: e.target.value })} error={errors.house} autoComplete="organization" />
            <Input label={dest === "hotel" ? "Room number (optional)" : "Floor or reception instructions (optional)"} value={place.detail} onChange={(e) => setPlace({ ...place, detail: e.target.value })} placeholder={dest === "hotel" ? "e.g. Room 204" : "e.g. 2nd floor, ask for Accounts"} />
          </>
        ) : <Input label="House / Flat / Shop no." required value={form.house} onChange={(e) => set("house", e.target.value)} error={errors.house} placeholder="e.g. 12, First floor" autoComplete="address-line1" />}
        <Input label="Area / Colony" required value={form.area} onChange={(e) => set("area", e.target.value)} error={errors.area} placeholder="e.g. Sadar Bazaar" autoComplete="address-level3" />
        <Input label="Landmark (optional)" value={form.landmark ?? ""} onChange={(e) => set("landmark", e.target.value)} error={errors.landmark} placeholder="e.g. opposite SBI bank" hint="Helps the rider find you faster." />
        <Input label="Receiver's name" required value={nameValue} onChange={(e) => set("full_name", e.target.value)} error={errors.full_name} autoComplete="name" hint="Ordering for someone else? Enter their name and number." />
        <Input label="Mobile number" required inputMode="numeric" value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} error={errors.phone} autoComplete="tel-national" placeholder="10-digit number" hint="The rider calls this number." />
        <Input label="City" required value={form.city} onChange={(e) => set("city", e.target.value)} error={errors.city} autoComplete="address-level2" />
        <Input label="Pincode" required inputMode="numeric" value={form.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} error={errors.pincode} autoComplete="postal-code" />
        {dest === "other" ? <Input label="Label" value={form.label ?? ""} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Mom's house" /> : null}
      </div>
      {isPlace ? <Checkbox label={dest === "hotel" ? "Hand over at hotel reception" : "Hand over at office reception"} checked={place.reception} onChange={(e) => setPlace({ ...place, reception: e.target.checked })} /> : null}
      {areaError ? <div role="alert"><Alert tone="danger" title="Outside our delivery area">{areaError} We deliver in {site.city} (pincodes {site.servicePincodes.join(", ")}).</Alert></div> : null}
      <Checkbox label="Make this my default address" checked={Boolean(form.is_default)} onChange={(e) => set("is_default", e.target.checked)} />
      <div className="flex gap-2">
        {onCancel ? <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="flex-1">Cancel</Button> : null}
        <Button type="submit" loading={busy} disabled={busy} className="flex-1">{busy ? "Saving…" : "Save address"}</Button>
      </div>
    </form>
  );
}
