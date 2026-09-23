"use client";
import * as React from "react";
import { getCartSummary } from "@/lib/actions/cart";
import { useCartStore } from "@/stores/cart-store";
import type { CartSummary } from "@/types/app";

/** Hydrates the client cart mirror once per session load. */
export function CartProvider({ initial, signedIn, children }: { initial: CartSummary | null; signedIn: boolean; children: React.ReactNode }) {
  const setSummary = useCartStore((s) => s.setSummary);
  React.useEffect(() => { setSummary(initial); }, [initial, setSummary]);
  React.useEffect(() => {
    if (!signedIn) return;
    const onFocus = () => getCartSummary().then(setSummary);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [signedIn, setSummary]);
  return <>{children}</>;
}
