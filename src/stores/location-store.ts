"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Serviceability } from "@/types/app";

export type SavedLocation = { label: string; area: string; pincode: string; lat: number | null; lng: number | null; serviceable: boolean; zoneName?: string; etaMin?: number; etaMax?: number; addressId?: string };

type LocationState = { location: SavedLocation | null; setLocation: (l: SavedLocation | null) => void; fromServiceability: (s: Serviceability, extra: Partial<SavedLocation>) => void };

export const useLocationStore = create<LocationState>()(persist((set) => ({
  location: null,
  setLocation: (location) => set({ location }),
  fromServiceability: (s, extra) => set({
    location: {
      label: extra.label ?? s.area ?? s.zone_name ?? "Merta City",
      area: extra.area ?? s.area ?? "",
      pincode: extra.pincode ?? s.pincode ?? "",
      lat: extra.lat ?? null, lng: extra.lng ?? null,
      serviceable: s.serviceable, zoneName: s.zone_name, etaMin: s.eta_min_minutes, etaMax: s.eta_max_minutes, addressId: extra.addressId,
    },
  }),
}), { name: "md-location" }));
