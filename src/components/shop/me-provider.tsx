"use client";
import * as React from "react";
import { useMeStore, SESSION_EVENT, type Me } from "@/stores/me-store";
import { useCartStore } from "@/stores/cart-store";
import { CART_CHANNEL } from "@/lib/cart-sync";

/**
 * Loads the personal part of the shop chrome (`/api/me`) once the page is on screen and keeps it
 * fresh: again when the tab is focused or shown, when the network returns, when another tab changes
 * the cart (BroadcastChannel) and when sign-in, a new guest session or an address save says so
 * (`notifySessionChanged`). The pages themselves carry nothing personal, so they come from the CDN.
 */
export function MeProvider({ children }: { children: React.ReactNode }) {
  const setMe = useMeStore((s) => s.setMe);
  const setLoading = useMeStore((s) => s.setLoading);
  const setSummary = useCartStore((s) => s.setSummary);

  React.useEffect(() => {
    let alive = true; let inflight: Promise<void> | null = null;
    const load = () => {
      if (inflight) return inflight;
      setLoading(true);
      inflight = fetch("/api/me", { credentials: "same-origin", cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Me>) : Promise.reject(new Error(String(r.status)))))
        .then((me) => { if (!alive) return; setMe(me); setSummary(me.cart); })
        .catch(() => { if (alive) setLoading(false); })
        .finally(() => { inflight = null; });
      return inflight;
    };
    const t = setTimeout(load, 0);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onEvent = () => { void load(); };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CART_CHANNEL) : null;
    if (channel) channel.onmessage = onEvent;
    window.addEventListener("focus", onEvent);
    window.addEventListener("online", onEvent);
    window.addEventListener(SESSION_EVENT, onEvent);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false; clearTimeout(t); channel?.close();
      window.removeEventListener("focus", onEvent); window.removeEventListener("online", onEvent); window.removeEventListener(SESSION_EVENT, onEvent);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [setMe, setLoading, setSummary]);

  return <>{children}</>;
}
