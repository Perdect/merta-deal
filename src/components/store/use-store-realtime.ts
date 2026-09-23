"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to order inserts/updates for one store (RLS lets members see them) and calls
 * `onChange` debounced — callers typically `router.refresh()` so server-rendered lists update.
 * Falls back to slow polling when realtime is unavailable.
 */
export function useStoreOrdersRealtime(storeId: string, onChange: () => void, opts: { pollMs?: number; inventory?: boolean } = {}) {
  const ref = React.useRef(onChange);
  React.useEffect(() => { ref.current = onChange; });
  const [connected, setConnected] = React.useState(false);
  React.useEffect(() => {
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => ref.current(), 500); };
    const ch = supabase.channel(`store-orders:${storeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` }, bump)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` }, bump);
    if (opts.inventory) ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "inventory", filter: `store_id=eq.${storeId}` }, bump);
    ch.subscribe((status) => setConnected(status === "SUBSCRIBED"));
    const poll = setInterval(() => ref.current(), opts.pollMs ?? 45000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); if (t) clearTimeout(t); };
  }, [storeId, opts.pollMs, opts.inventory]);
  return connected;
}
