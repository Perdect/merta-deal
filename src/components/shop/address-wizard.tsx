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
    <div className="max-sm:px-4 max-sm:py-4">
      <button type="button" onClick={() => setPicked(null)} className="tap mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"><ChevronLeft className="h-4 w-4" aria-hidden /> Change location on map</button>
      <AddressForm
        initial={{ lat: picked.lat, lng: picked.lng, area: picked.area ?? "", pincode: picked.pincode ?? undefined, street: picked.street ?? "" }}
        defaultName={defaultName} defaultPhone={defaultPhone} onSaved={onSaved} onCancel={onCancel} />
    </div>
  );
}
