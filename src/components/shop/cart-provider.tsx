"use client";
import * as React from "react";
import { getCartSummary } from "@/lib/actions/cart";
import { useCartStore } from "@/stores/cart-store";
import type { CartSummary } from "@/types/app";
import { CART_CHANNEL } from "@/lib/cart-sync";

/**
 * Hydrates the client cart mirror, and keeps every open tab in step: reloads the server cart when
 * the tab is focused or shown again, and at once when another tab changes it (BroadcastChannel).
 */
export function CartProvider({ initial, signedIn, children }: { initial: CartSummary | null; signedIn: boolean; children: React.ReactNode }) {
  const setSummary = useCartStore((s) => s.setSummary);
  React.useEffect(() => { setSummary(initial); }, [initial, setSummary]);
  React.useEffect(() => {
    if (!signedIn) return;
    const reload = () => getCartSummary().then((s) => { if (s) setSummary(s); }).catch(() => {});
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CART_CHANNEL) : null;
    if (channel) channel.onmessage = reload;
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("focus", reload); document.removeEventListener("visibilitychange", onVisible); channel?.close(); };
  }, [signedIn, setSummary]);
  return <>{children}</>;
}
