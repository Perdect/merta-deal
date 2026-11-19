"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, Loader2 } from "lucide-react";
import type { Address } from "@/types/app";
import { AddressForm, type AddressDraft } from "./address-form";
import type { PickedLocation } from "./map-picker";

/* The map (Leaflet + tiles + geocoder) is only fetched when the customer asks for it. */
const MapPicker = dynamic(() => import("./map-picker").then((m) => m.MapPicker), {
  ssr: false,
  loading: () => <div className="flex min-h-[520px] items-center justify-center text-sm text-ink-3" role="status"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Opening the map…</div>,
});

/**
 * New address: the details form comes first and can be saved on its own (the server checks the
 * delivery zone by pin or pincode). "Choose on map" is an optional step that opens the map picker and
 * returns a precise pin plus the looked-up area and pincode into the same, still-filled form. GPS is
 * a shortcut inside the form, never a requirement.
 */
export function AddressWizard({ onSaved, onCancel, defaultName, defaultPhone, mapOpen: mapOpenProp, onMapOpenChange }: {
  onSaved: (a: Address) => void; onCancel?: () => void; defaultName?: string | null; defaultPhone?: string | null;
  /** Hosts that own the screen header (title + back arrow) drive the step from outside; the map
   *  step then draws no back link of its own, so there is one back control, not two. */
  mapOpen?: boolean; onMapOpenChange?: (open: boolean) => void;
}) {
  const [draft, setDraft] = React.useState<AddressDraft | null>(null);
  const [mapOpenOwn, setMapOpenOwn] = React.useState(false);
  const headed = mapOpenProp !== undefined;
  const mapOpen = mapOpenProp ?? mapOpenOwn;
  const setMapOpen = (open: boolean) => { setMapOpenOwn(open); onMapOpenChange?.(open); };
  const [picked, setPicked] = React.useState<PickedLocation | null>(null);

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  if (mapOpen) {
    const dl = num(draft?.lat), dg = num(draft?.lng);
    const start = dl != null && dg != null ? { lat: dl, lng: dg } : picked ? { lat: picked.lat, lng: picked.lng } : null;
    return (
      <div className="flex h-full flex-col">
        {headed ? null : <button type="button" onClick={() => setMapOpen(false)} className="tap mb-1 inline-flex min-h-11 items-center gap-1 self-start px-4 text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:px-0"><ChevronLeft className="h-4 w-4" aria-hidden /> Back to address details</button>}
        <MapPicker initial={start} confirmLabel="Confirm Location" onConfirm={(p) => { setPicked(p); setMapOpen(false); }} onManual={() => setMapOpen(false)} />
      </div>
    );
  }

  return (
    <div className="max-sm:px-4 max-sm:py-4">
      <AddressForm
        key={picked ? `${picked.lat},${picked.lng}` : "form"}
        initial={{
          ...(draft ? { type: draft.type, label: draft.label ?? null, full_name: draft.full_name, phone: draft.phone, house: draft.house, street: draft.street ?? "", area: draft.area, landmark: draft.landmark ?? null, city: draft.city, pincode: draft.pincode, lat: num(draft.lat), lng: num(draft.lng), is_default: Boolean(draft.is_default) } : {}),
          ...(picked ? { lat: picked.lat, lng: picked.lng, area: draft?.area || picked.area || "", street: draft?.street || picked.street || "" } : {}),
        } as Partial<Address>}
        pinLabel={picked ? picked.area ?? picked.street ?? picked.formatted?.split(",")[0]?.trim() ?? picked.city ?? null : null}
        defaultName={defaultName} defaultPhone={defaultPhone} onSaved={onSaved} onCancel={onCancel}
        onChooseMap={(d) => { setDraft(d); setMapOpen(true); }} />
    </div>
  );
}
