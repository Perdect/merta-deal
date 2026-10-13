"use client";
import * as React from "react";
import { LocateFixed, Home, Briefcase, MapPin } from "lucide-react";
import { saveAddressAction, type AddressInput } from "@/lib/actions/checkout";
import type { Address } from "@/types/app";
import { Button } from "@/components/ui/button";
import { Input, Checkbox } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { site } from "@/config/site";

const TYPES = [{ v: "home", label: "Home", icon: Home }, { v: "work", label: "Work", icon: Briefcase }, { v: "other", label: "Other", icon: MapPin }] as const;

export function AddressForm({ initial, onSaved, onCancel, defaultName, defaultPhone }: { initial?: Partial<Address>; onSaved: (a: Address) => void; onCancel?: () => void; defaultName?: string | null; defaultPhone?: string | null }) {
  const [form, setForm] = React.useState<AddressInput>({
    id: initial?.id, type: initial?.type ?? "home", label: initial?.label ?? "", full_name: initial?.full_name ?? defaultName ?? "", phone: initial?.phone ?? defaultPhone ?? "",
    house: initial?.house ?? "", street: initial?.street ?? "", area: initial?.area ?? "", landmark: initial?.landmark ?? "", city: initial?.city ?? site.city, pincode: initial?.pincode ?? site.defaultPincode,
    lat: initial?.lat ?? null, lng: initial?.lng ?? null, is_default: initial?.is_default ?? false,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const set = (k: keyof AddressInput, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

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
      toast.error(err.code === err.PERMISSION_DENIED ? "Location permission is blocked. Allow it in your browser settings." : "Could not get your location. Type the address instead.");
      setLocating(false);
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErrors({});
    const r = await saveAddressAction(form);
    setBusy(false);
    if (!r.ok) { setErrors(r.fieldErrors ?? {}); toast.error(r.error); return; }
    toast.success("Address saved"); onSaved(r.data);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {TYPES.map(({ v, label, icon: Icon }) => (
          <button key={v} type="button" onClick={() => set("type", v)} className={cn("flex h-11 items-center justify-center gap-2 rounded-sm border text-sm font-semibold", form.type === v ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-2 bg-card text-ink-2")}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </div>
      <Button type="button" variant="secondary" fullWidth loading={locating} onClick={locate}><LocateFixed className="h-4 w-4" /> {form.lat ? "Location pinned · Update GPS" : "Use current location (GPS)"}</Button>
      {/* Only what a rider needs: house, area, receiver and phone; city and pincode come prefilled. Street/landmark already saved on an address are kept. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="House / Flat / Shop no." required value={form.house} onChange={(e) => set("house", e.target.value)} error={errors.house} placeholder="e.g. 12, First floor" autoComplete="address-line1" />
        <Input label="Area / Colony" required value={form.area} onChange={(e) => set("area", e.target.value)} error={errors.area} placeholder="e.g. Sadar Bazaar" autoComplete="address-level3" />
        <Input label="Receiver's name" required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} error={errors.full_name} autoComplete="name" />
        <Input label="Mobile number" required inputMode="numeric" value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} error={errors.phone} autoComplete="tel-national" placeholder="10-digit number" />
        <Input label="City" required value={form.city} onChange={(e) => set("city", e.target.value)} error={errors.city} autoComplete="address-level2" />
        <Input label="Pincode" required inputMode="numeric" value={form.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} error={errors.pincode} autoComplete="postal-code" />
        {form.type === "other" ? <Input label="Label" value={form.label ?? ""} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Mom's house" /> : null}
      </div>
      <Checkbox label="Make this my default address" checked={Boolean(form.is_default)} onChange={(e) => set("is_default", e.target.checked)} />
      <div className="flex gap-2">
        {onCancel ? <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button> : null}
        <Button type="submit" loading={busy} className="flex-1">Save address</Button>
      </div>
    </form>
  );
}
