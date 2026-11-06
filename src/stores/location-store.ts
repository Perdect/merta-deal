"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Address, Serviceability } from "@/types/app";

/**
 * The customer's delivery location as the header, product cards and cart show it. Nothing is
 * assumed: it is only set from the browser's position, a saved address, a map pin or a pincode the
 * customer typed, and `serviceable` is the real zone check for it. No location → "Select delivery
 * location", and no delivery time is promised.
 */
export type SavedLocation = {
  /** Short line for the header: locality and city ("Sadar Bazaar, Merta City") or the address title. */
  label: string;
  /** Full line for the selector (address, or what the reverse geocode returned). */
  detail?: string;
  area: string; pincode: string; lat: number | null; lng: number | null;
  serviceable: boolean; zoneName?: string; etaMin?: number; etaMax?: number; addressId?: string;
  source?: "gps" | "address" | "pincode" | "map";
};

type LocationState = { location: SavedLocation | null; setLocation: (l: SavedLocation | null) => void; fromServiceability: (s: Serviceability, extra: Partial<SavedLocation>) => void };

export const useLocationStore = create<LocationState>()(persist((set) => ({
  location: null,
  setLocation: (location) => set({ location }),
  fromServiceability: (s, extra) => set({
    location: {
      label: extra.label ?? s.area ?? s.zone_name ?? "Merta City",
      detail: extra.detail,
      area: extra.area ?? s.area ?? "",
      pincode: extra.pincode ?? s.pincode ?? "",
      lat: extra.lat ?? null, lng: extra.lng ?? null,
      serviceable: s.serviceable, zoneName: s.zone_name, etaMin: s.eta_min_minutes, etaMax: s.eta_max_minutes, addressId: extra.addressId,
      source: extra.source,
    },
  }),
}), { name: "md-location" }));

export const addressTitle = (a: Address) => a.label || (a.type === "work" ? "Office" : a.type[0].toUpperCase() + a.type.slice(1));
export const addressLine = (a: Address) => [a.house, a.street, a.area, a.landmark ? `near ${a.landmark}` : null, `${a.city} – ${a.pincode}`].filter(Boolean).join(", ");

/** Zone check for an address: by its pin when it has one (the pincode breaks ties), else by pincode. */
export async function checkAddress(a: Pick<Address, "lat" | "lng" | "pincode">): Promise<Serviceability> {
  const q = new URLSearchParams(a.lat != null && a.lng != null ? { lat: String(a.lat), lng: String(a.lng), pincode: a.pincode } : { pincode: a.pincode });
  const r = await fetch(`/api/location/serviceability?${q}`);
  return (await r.json()) as Serviceability;
}

/**
 * Makes a saved address the delivery location everywhere (header, cards, cart): the same row the
 * cart and checkout use. Returns the check so callers can tell the customer when it is not served.
 */
export async function adoptAddress(a: Address): Promise<Serviceability> {
  const s = await checkAddress(a);
  useLocationStore.getState().setLocation({
    label: `${addressTitle(a)} · ${a.area}`, detail: addressLine(a), area: a.area, pincode: a.pincode, lat: a.lat, lng: a.lng,
    serviceable: s.serviceable, zoneName: s.zone_name, etaMin: s.eta_min_minutes, etaMax: s.eta_max_minutes, addressId: a.id, source: "address",
  });
  return s;
}
