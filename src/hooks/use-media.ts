"use client";
import * as React from "react";

/** Live CSS media query match (false during server render and before hydration). */
export function useMedia(query: string) {
  return React.useSyncExternalStore(
    (cb) => { const mq = window.matchMedia(query); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
