"use client";
import * as React from "react";
import { ChevronLeft } from "lucide-react";
import type { Address } from "@/types/app";
import { AddressForm } from "./address-form";
import { MapPicker, type PickedLocation } from "./map-picker";

/**
 * New address in two steps: drop the pin on the map, then add house / area / receiver details.
 * The pin's coordinates (and the looked-up area and pincode) prefill the form.
 */
export function AddressWizard({ onSaved, onCancel, defaultName, defaultPhone }: { onSaved: (a: Address) => void; onCancel?: () => void; defaultName?: string | null; defaultPhone?: string | null }) {
  const [picked, setPicked] = React.useState<PickedLocation | null>(null);
  if (!picked) return <MapPicker onConfirm={setPicked} />;
  return (
    <div>
      <button type="button" onClick={() => setPicked(null)} className="tap mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700"><ChevronLeft className="h-4 w-4" /> Change location on map</button>
      <AddressForm
        initial={{ lat: picked.lat, lng: picked.lng, area: picked.area ?? "", pincode: picked.pincode ?? undefined, street: picked.street ?? "" }}
        defaultName={defaultName} defaultPhone={defaultPhone} onSaved={onSaved} onCancel={onCancel} />
    </div>
  );
}
