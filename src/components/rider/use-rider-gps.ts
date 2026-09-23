"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { haversineKm } from "@/lib/utils";
import { useRiderStore, type GpsFix } from "./rider-store";

const MIN_INTERVAL_MS = 5_000;
const MIN_MOVE_M = 20;
const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Streams the rider's real GPS position to `record_rider_location` while `enabled`.
 * Uses `watchPosition` with high accuracy, throttled to one RPC every 5 s or 20 m moved,
 * and restarts the watch when the tab becomes visible again (browsers throttle hidden tabs —
 * true background tracking needs the native wrapper; the profile page says so).
 */
export function useRiderGps(enabled: boolean) {
  const setGps = useRiderStore((s) => s.setGps);

  React.useEffect(() => {
    if (!enabled) { setGps({ status: "idle", error: null, sendError: null }); return; }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) { setGps({ status: "unavailable", error: "This device or browser has no GPS support." }); return; }

    const supabase = createClient();
    let watchId: number | null = null;
    let lastSent: { at: number; lat: number; lng: number } | null = null;
    let inflight = false;
    let stopped = false;

    const send = async (fix: GpsFix) => {
      if (inflight) return;
      inflight = true;
      const { error } = await supabase.rpc("record_rider_location", { p_lat: fix.lat, p_lng: fix.lng, p_accuracy: fix.accuracy ?? undefined, p_heading: fix.heading ?? undefined, p_speed: fix.speed ?? undefined });
      inflight = false;
      if (stopped) return;
      if (error) { setGps({ sendError: error.message }); return; }
      lastSent = { at: fix.at, lat: fix.lat, lng: fix.lng };
      setGps({ lastSentAt: fix.at, sendError: null });
    };

    const onPosition = (pos: GeolocationPosition) => {
      const c = pos.coords;
      const fix: GpsFix = { lat: c.latitude, lng: c.longitude, accuracy: num(c.accuracy), heading: num(c.heading), speed: num(c.speed), at: Date.now() };
      setGps({ status: "watching", fix, error: null });
      const elapsed = lastSent ? fix.at - lastSent.at : Infinity;
      const movedM = lastSent ? haversineKm(lastSent.lat, lastSent.lng, fix.lat, fix.lng) * 1000 : Infinity;
      if (elapsed >= MIN_INTERVAL_MS || movedM >= MIN_MOVE_M) void send(fix);
    };

    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) setGps({ status: "denied", error: "Location access is blocked. Allow location for this site in your browser settings." });
      else if (err.code === err.POSITION_UNAVAILABLE) setGps({ status: "error", error: "GPS signal unavailable right now. Move to an open area." });
      else setGps({ status: "error", error: "Waiting for a GPS fix…" });
    };

    const start = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (useRiderStore.getState().gps.status !== "watching") setGps({ status: "starting" });
      watchId = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 });
    };
    const onVisibility = () => { if (document.visibilityState === "visible") start(); };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      setGps({ status: "idle" });
    };
  }, [enabled, setGps]);
}

/** Keeps the screen awake during an active delivery (real Screen Wake Lock API; silently unsupported elsewhere). */
export function useWakeLock(active: boolean) {
  React.useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try { lock = await navigator.wakeLock.request("screen"); if (cancelled) await lock.release(); } catch { /* denied or low battery — nothing to fake */ }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisibility); void lock?.release(); };
  }, [active]);
}

/** Resolves one real GPS fix (used when going online). Rejects with a human-readable message. */
export function getCurrentFix(): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) { reject(new Error("This device or browser has no GPS support.")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: num(pos.coords.accuracy), heading: num(pos.coords.heading), speed: num(pos.coords.speed), at: Date.now() }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? "Location access is blocked. Allow location for this site to go online." : err.code === err.TIMEOUT ? "Could not get a GPS fix in time. Move to an open area and retry." : "GPS is unavailable right now. Try again in a moment.")),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
  });
}
