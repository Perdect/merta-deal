"use client";
import { create } from "zustand";
import type { CartSummary } from "@/types/app";
import type { CakeChoice } from "@/lib/cake";

/**
 * Client mirror of the server cart. The database is the source of truth (cart_summary RPC);
 * this store caches the last summary and tracks in-flight quantity updates for snappy UI.
 */
type CartState = {
  summary: CartSummary | null;
  loading: boolean;
  pending: Record<string, number>; // inventory_id -> optimistic qty
  /** Cake options chosen on the product page per inventory_id (0049); sent with every quantity change of that line. */
  draft: Record<string, CakeChoice>;
  setDraft: (inventoryId: string, choice: CakeChoice | null) => void;
  /** Slide-in cart panel: closed, the cart itself, or the payment step. */
  drawer: null | "cart" | "pay";
  /** Sheets that can open over any page (the cart panel owns them): pick/add an address, sign in, or pick a delivery slot. */
  sheet: null | "address" | "login" | "schedule";
  /** Explanation shown at the top of the cart until dismissed (e.g. what a reorder changed). */
  notice: { title: string; lines: string[] } | null;
  setNotice: (n: { title: string; lines: string[] } | null) => void;
  /** The product just added for the first time, for the header's "Added to Cart" card; the line itself is read from `summary`. */
  added: { inventoryId: string; at: number } | null;
  setAdded: (inventoryId: string | null) => void;
  openDrawer: (step?: "cart" | "pay") => void;
  closeDrawer: () => void;
  openSheet: (sheet: "address" | "login" | "schedule") => void;
  closeSheet: () => void;
  setSummary: (s: CartSummary | null) => void;
  setLoading: (v: boolean) => void;
  setPending: (inventoryId: string, qty: number | null) => void;
  qtyFor: (inventoryId: string) => number;
  totalCount: () => number;
};

export const useCartStore = create<CartState>((set, get) => ({
  summary: null,
  loading: false,
  pending: {},
  draft: {},
  setDraft: (inventoryId, choice) => set((s) => {
    const draft = { ...s.draft };
    if (choice == null) delete draft[inventoryId]; else draft[inventoryId] = choice;
    return { draft };
  }),
  drawer: null,
  sheet: null,
  notice: null,
  setNotice: (notice) => set({ notice }),
  added: null,
  setAdded: (inventoryId) => set({ added: inventoryId ? { inventoryId, at: Date.now() } : null }),
  openDrawer: (step = "cart") => set({ drawer: step }),
  closeDrawer: () => set({ drawer: null }),
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: null }),
  setSummary: (summary) => set({ summary }),
  setLoading: (loading) => set({ loading }),
  setPending: (inventoryId, qty) => set((s) => {
    const pending = { ...s.pending };
    if (qty == null) delete pending[inventoryId]; else pending[inventoryId] = qty;
    return { pending };
  }),
  qtyFor: (inventoryId) => {
    const p = get().pending[inventoryId];
    if (typeof p === "number") return p;
    return get().summary?.items.find((i) => i.inventory_id === inventoryId)?.quantity ?? 0;
  },
  totalCount: () => {
    const s = get().summary;
    if (!s) return 0;
    const pending = get().pending;
    return s.items.reduce((acc, i) => acc + (typeof pending[i.inventory_id] === "number" ? pending[i.inventory_id] : i.quantity), 0) + Object.entries(pending).filter(([id]) => !s.items.some((i) => i.inventory_id === id)).reduce((a, [, q]) => a + q, 0);
  },
}));
