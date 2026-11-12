"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { TrackingLocation } from "@/types/app";
import { realtimeTopic } from "@/lib/realtime-topic";

/**
 * Subscribes to Supabase Realtime for one order: order row, its assignments, status history and
 * rider GPS points. Calls `onChange` (debounced) so the caller can refetch the tracking payload,
 * and streams raw location points for the map trail.
 *
 * Missed changes are recovered: the first subscription after a drop, the tab coming back to the
 * foreground and the network returning each trigger one refetch. While the channel is down the
 * caller is polled instead (never while live, so a connected page costs nothing extra).
 */
export function useOrderRealtime(orderId: string, assignmentId: string | null, onChange: () => void, onLocation?: (loc: TrackingLocation) => void) {
  const changeRef = React.useRef(onChange);
  const locRef = React.useRef(onLocation);
  React.useEffect(() => { changeRef.current = onChange; locRef.current = onLocation; });
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => changeRef.current(), 400); };
    const ch = supabase.channel(realtimeTopic(`order:${orderId}`))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_assignments", filter: `order_id=eq.${orderId}` }, bump)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_status_history", filter: `order_id=eq.${orderId}` }, bump);
    if (assignmentId) {
      ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "delivery_locations", filter: `assignment_id=eq.${assignmentId}` }, (payload) => {
        const r = payload.new as { lat: number; lng: number; heading: number | null; speed_mps: number | null; accuracy_m: number | null; recorded_at: string };
        locRef.current?.({ lat: r.lat, lng: r.lng, heading: r.heading, speed_mps: r.speed_mps, accuracy_m: r.accuracy_m, recorded_at: r.recorded_at });
      });
    }
    let live = false; let wasDown = false; let dirty = false;
    ch.subscribe((status) => {
      live = status === "SUBSCRIBED";
      setConnected(live);
      if (live && wasDown) bump(); // whatever changed while the socket was down
      if (!live) wasDown = true;
    });
    // Fallback polling only while realtime is unavailable (e.g. table not in publication yet);
    // a live subscription already pushes every change, so polling then is wasted work. A hidden tab
    // is not polled either: it refetches once when it is shown again.
    const poll = setInterval(() => { if (live) return; if (document.visibilityState === "hidden") { dirty = true; return; } changeRef.current(); }, 20000);
    const onVisible = () => { if (document.visibilityState === "visible" && (dirty || !live)) { dirty = false; bump(); } };
    const onOnline = () => bump();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      supabase.removeChannel(ch); clearInterval(poll); if (t) clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onOnline);
    };
  }, [orderId, assignmentId]);
  return connected;
}
