"use client";
import * as React from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { site } from "@/config/site";
import type { Store } from "@/types/app";
import type { StoreProfileInput } from "@/lib/actions/store";

/** String-backed form state so inputs stay controlled; converted to numbers on submit. */
export type StoreFormState = {
  name: string; tagline: string; description: string; owner_name: string; phone: string; email: string;
  address_line1: string; address_line2: string; area: string; landmark: string; pincode: string; lat: number | null; lng: number | null;
  gstin: string; pan: string; bank_account_name: string; bank_account_number: string; bank_ifsc: string; upi_id: string;
  delivery_radius_km: string; opening_time: string; closing_time: string; avg_prep_minutes: string; min_order_amount: string;
  logo_url: string | null; cover_url: string | null;
};

export function emptyStoreForm(defaults: { owner_name?: string | null; phone?: string | null; email?: string | null } = {}): StoreFormState {
  return {
    name: "", tagline: "", description: "", owner_name: defaults.owner_name ?? "", phone: defaults.phone ?? "", email: defaults.email ?? "",
    address_line1: "", address_line2: "", area: "", landmark: "", pincode: site.defaultPincode, lat: null, lng: null,
    gstin: "", pan: "", bank_account_name: "", bank_account_number: "", bank_ifsc: "", upi_id: "",
    delivery_radius_km: "5", opening_time: "07:00", closing_time: "22:00", avg_prep_minutes: "15", min_order_amount: "", logo_url: null, cover_url: null,
  };
}

const hhmm = (t: string | null | undefined) => (t ?? "07:00").slice(0, 5);

export function storeToForm(s: Store): StoreFormState {
  return {
    name: s.name, tagline: s.tagline ?? "", description: s.description ?? "", owner_name: s.owner_name, phone: s.phone, email: s.email ?? "",
    address_line1: s.address_line1, address_line2: s.address_line2 ?? "", area: s.area, landmark: s.landmark ?? "", pincode: s.pincode, lat: s.lat, lng: s.lng,
    gstin: s.gstin ?? "", pan: s.pan ?? "", bank_account_name: s.bank_account_name ?? "", bank_account_number: s.bank_account_number ?? "", bank_ifsc: s.bank_ifsc ?? "", upi_id: s.upi_id ?? "",
    delivery_radius_km: String(s.delivery_radius_km), opening_time: hhmm(s.opening_time), closing_time: hhmm(s.closing_time), avg_prep_minutes: String(s.avg_prep_minutes),
    min_order_amount: s.min_order_amount == null ? "" : String(s.min_order_amount), logo_url: s.logo_url, cover_url: s.cover_url,
  };
}

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

export function formToInput(f: StoreFormState): StoreProfileInput {
  return {
    name: f.name, tagline: f.tagline, description: f.description, owner_name: f.owner_name, phone: f.phone.replace(/\D/g, "").slice(-10), email: f.email,
    address_line1: f.address_line1, address_line2: f.address_line2, area: f.area, landmark: f.landmark, pincode: f.pincode,
    lat: f.lat as number, lng: f.lng as number,
    gstin: f.gstin.toUpperCase(), pan: f.pan.toUpperCase(), bank_account_name: f.bank_account_name, bank_account_number: f.bank_account_number, bank_ifsc: f.bank_ifsc.toUpperCase(), upi_id: f.upi_id,
    delivery_radius_km: num(f.delivery_radius_km), opening_time: f.opening_time, closing_time: f.closing_time, avg_prep_minutes: num(f.avg_prep_minutes),
    min_order_amount: f.min_order_amount.trim() === "" ? null : num(f.min_order_amount), logo_url: f.logo_url, cover_url: f.cover_url,
  };
}

/** Uses the browser's GPS to fill lat/lng (required for delivery distance & the customer map). */
export function useShopLocator(set: (k: "lat" | "lng" | "pincode" | "area", v: string | number | null) => void, current: { area: string }) {
  const [locating, setLocating] = React.useState(false);
  const locate = React.useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { toast.error("Location is not supported on this device"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      set("lat", pos.coords.latitude); set("lng", pos.coords.longitude);
      try {
        const r = await fetch(`/api/maps/geocode?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
        const d = await r.json();
        if (d.ok) { if (d.area && !current.area) set("area", d.area); if (d.pincode) set("pincode", d.pincode); toast.success("Shop location pinned"); }
        else toast.info("Shop location pinned", d.message ?? "Fill in the address details.");
      } catch { toast.info("Shop location pinned"); }
      setLocating(false);
    }, () => { toast.error("Could not get your location. Allow location access (stand inside the shop) and try again."); setLocating(false); }, { enableHighAccuracy: true, timeout: 12000 });
  }, [set, current.area]);
  return { locate, locating };
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card sm:p-5">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {subtitle ? <p className="mb-3 text-xs text-ink-3">{subtitle}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

/** All editable store profile inputs. `mode` hides sections that don't belong on a given screen. */
export function StoreProfileFields({ form, set, errors, mode = "full" }: { form: StoreFormState; set: <K extends keyof StoreFormState>(k: K, v: StoreFormState[K]) => void; errors: Record<string, string>; mode?: "full" | "register" }) {
  const { locate, locating } = useShopLocator((k, v) => set(k, v as never), { area: form.area });
  const digits = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);
  return (
    <div className="space-y-4">
      <Section title="Shop details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Store name" required value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} placeholder="e.g. Jain Kirana Store" autoComplete="organization" />
          <Input label="Owner name" required value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} error={errors.owner_name} autoComplete="name" />
          <Input label="Mobile number" required inputMode="numeric" value={form.phone} onChange={(e) => set("phone", digits(e.target.value, 10))} error={errors.phone} hint="Customers and riders call this number" autoComplete="tel" />
          <Input label="Email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} autoComplete="email" />
          {mode === "full" ? <Input label="Tagline" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} error={errors.tagline} placeholder="Sadar Bazaar ki bharosemand dukaan" wrapperClassName="sm:col-span-2" /> : null}
        </div>
        {mode === "full" ? <div className="mt-3"><Textarea label="About the store" value={form.description} onChange={(e) => set("description", e.target.value)} error={errors.description} placeholder="What you are known for, specialities, delivery promise…" /></div> : null}
      </Section>

      <Section title="Location" subtitle="Stand inside the shop and tap the GPS button — delivery distance and the customer map depend on it.">
        <Button type="button" variant={form.lat ? "outline" : "secondary"} fullWidth loading={locating} onClick={locate}><LocateFixed className="h-4 w-4" /> {form.lat ? "Location pinned · Update GPS" : "Pin shop location with GPS"}</Button>
        {form.lat && form.lng ? <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-3"><MapPin className="h-3 w-3" /> {form.lat.toFixed(5)}, {form.lng.toFixed(5)}</p> : errors.lat ? <p className="mt-2 text-xs text-danger">{errors.lat}</p> : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input label="Shop address" required value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} error={errors.address_line1} placeholder="Shop no., building, street" wrapperClassName="sm:col-span-2" autoComplete="street-address" />
          <Input label="Address line 2" value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)} error={errors.address_line2} />
          <Input label="Area / locality" required value={form.area} onChange={(e) => set("area", e.target.value)} error={errors.area} placeholder="Sadar Bazaar" />
          <Input label="Landmark" value={form.landmark} onChange={(e) => set("landmark", e.target.value)} error={errors.landmark} placeholder="Near bus stand" />
          <Input label="Pincode" required inputMode="numeric" value={form.pincode} onChange={(e) => set("pincode", digits(e.target.value, 6))} error={errors.pincode} autoComplete="postal-code" />
        </div>
      </Section>

      <Section title="Delivery & timings">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Delivery radius (km)" required type="number" inputMode="decimal" min={0.5} max={30} step={0.5} value={form.delivery_radius_km} onChange={(e) => set("delivery_radius_km", e.target.value)} error={errors.delivery_radius_km} />
          <Input label="Average packing time (minutes)" required type="number" inputMode="numeric" min={5} max={180} value={form.avg_prep_minutes} onChange={(e) => set("avg_prep_minutes", e.target.value)} error={errors.avg_prep_minutes} hint="Used to estimate delivery time for customers" />
          <Input label="Opening time" required type="time" value={form.opening_time} onChange={(e) => set("opening_time", e.target.value)} error={errors.opening_time} />
          <Input label="Closing time" required type="time" value={form.closing_time} onChange={(e) => set("closing_time", e.target.value)} error={errors.closing_time} />
          {mode === "full" ? <Input label="Minimum order (₹, optional)" type="number" inputMode="numeric" min={0} value={form.min_order_amount} onChange={(e) => set("min_order_amount", e.target.value)} error={errors.min_order_amount} hint="Leave blank to use the platform minimum" /> : null}
        </div>
      </Section>

      <Section title="Tax & payout details" subtitle="Optional now, needed before your first payout. Payouts go to the bank account or UPI below.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="GSTIN" value={form.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase().slice(0, 15))} error={errors.gstin} placeholder="08ABCDE1234F1Z5" className="uppercase" />
          <Input label="PAN" value={form.pan} onChange={(e) => set("pan", e.target.value.toUpperCase().slice(0, 10))} error={errors.pan} placeholder="ABCDE1234F" className="uppercase" />
          <Input label="UPI ID" value={form.upi_id} onChange={(e) => set("upi_id", e.target.value.trim())} error={errors.upi_id} placeholder="shopname@upi" />
          <Input label="Account holder name" value={form.bank_account_name} onChange={(e) => set("bank_account_name", e.target.value)} error={errors.bank_account_name} />
          <Input label="Bank account number" inputMode="numeric" value={form.bank_account_number} onChange={(e) => set("bank_account_number", digits(e.target.value, 18))} error={errors.bank_account_number} />
          <Input label="IFSC" value={form.bank_ifsc} onChange={(e) => set("bank_ifsc", e.target.value.toUpperCase().slice(0, 11))} error={errors.bank_ifsc} placeholder="SBIN0001234" className="uppercase" />
        </div>
      </Section>
    </div>
  );
}
