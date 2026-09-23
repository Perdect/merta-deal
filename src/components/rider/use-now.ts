"use client";
import * as React from "react";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = 0;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => { now = Date.now(); listeners.forEach((l) => l()); }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) { clearInterval(timer); timer = null; }
  };
}

/**
 * A once-per-second clock shared by every countdown / "x s ago" label on screen.
 * Returns 0 during SSR and the very first client render (treat 0 as "unknown yet").
 */
export function useNow(): number {
  return React.useSyncExternalStore(subscribe, () => now, () => 0);
}
