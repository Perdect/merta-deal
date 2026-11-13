"use client";
import { create } from "zustand";
import type { Address, CartSummary, Coupon } from "@/types/app";
import type { SessionUser } from "@/lib/supabase/server";

/** What `/api/me` returns: everything in the shop chrome that depends on who is signed in. */
export type Me = {
  user: SessionUser | null;
  isGuest: boolean;
  name: string | null;
  phone: string | null;
  walletBalance: number;
  addresses: Address[];
  unread: number;
  coupons: Coupon[];
  cart: CartSummary | null;
};

export const SESSION_EVENT = "md:session";

/**
 * The signed-in customer's chrome data, loaded after the page is on screen so the catalogue pages
 * themselves carry nothing personal and can be served from the CDN. `me` is null until the first
 * answer; components treat that as "visitor" (the server actions behind every button check again).
 */
type MeState = { me: Me | null; loading: boolean; setMe: (me: Me) => void; setLoading: (v: boolean) => void };

export const useMeStore = create<MeState>((set) => ({
  me: null,
  loading: false,
  setMe: (me) => set({ me, loading: false }),
  setLoading: (loading) => set({ loading }),
}));

export const useSignedIn = () => useMeStore((s) => Boolean(s.me?.user));
export const useAddresses = () => useMeStore((s) => s.me?.addresses ?? EMPTY_ADDRESSES);
const EMPTY_ADDRESSES: Address[] = [];

/** Tell the provider the session or its data changed (sign-in, guest session started, address saved). */
export function notifySessionChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EVENT));
}
