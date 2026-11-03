"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Address, DeliveryType } from "@/types/app";

/**
 * What the customer has chosen on the way to paying: the delivery address, delivery option and
 * instructions. Kept in localStorage so a refresh, or the full-page sign-in a guest goes through at
 * "Proceed to Pay", lands them back where they were (the address keeps its id when a guest's rows are
 * handed to the account on login — see merge_guest_cart). Totals never live here: cart_summary is the
 * source of truth and is re-fetched for the chosen address.
 */
type CheckoutState = {
  addressId: string | null;
  deliveryType: DeliveryType;
  instructions: string;
  /** Set when a guest is sent to sign in from "Proceed to Pay": the payment step reopens once signed in. */
  resume: "pay" | null;
  /** Addresses saved in this session before the server re-rendered the layout with them (not persisted). */
  added: Address[];
  setAddressId: (id: string | null) => void;
  setDeliveryType: (t: DeliveryType) => void;
  setInstructions: (s: string) => void;
  setResume: (r: "pay" | null) => void;
  addAddress: (a: Address) => void;
};

export const useCheckoutStore = create<CheckoutState>()(persist((set) => ({
  addressId: null,
  deliveryType: "standard",
  instructions: "",
  resume: null,
  added: [],
  setAddressId: (addressId) => set({ addressId }),
  setDeliveryType: (deliveryType) => set({ deliveryType }),
  setInstructions: (instructions) => set({ instructions }),
  setResume: (resume) => set({ resume }),
  addAddress: (a) => set((s) => ({ added: [a, ...s.added.filter((x) => x.id !== a.id)] })),
}), { name: "md-checkout", partialize: (s) => ({ addressId: s.addressId, deliveryType: s.deliveryType, instructions: s.instructions, resume: s.resume }) }));
