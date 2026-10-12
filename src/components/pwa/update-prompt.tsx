"use client";
import * as React from "react";

/**
 * Silent service-worker updates: a new worker is activated as soon as it has installed, with no
 * prompt and no forced reload, so nothing on screen (a half-filled form, a cart edit) is lost.
 * Pages are always fetched from the network, so the next navigation picks up the new version.
 * Registration itself lives in PwaClient; this attaches to the existing registration.
 */
export function UpdatePrompt() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    const activate = (sw: ServiceWorker | null) => { if (sw && navigator.serviceWorker.controller) sw.postMessage({ type: "SKIP_WAITING" }); };

    navigator.serviceWorker.ready.then((reg) => {
      if (cancelled) return;
      activate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        installing?.addEventListener("statechange", () => { if (installing.state === "installed") activate(installing); });
      });
      reg.update().catch(() => {});
    }).catch(() => {});

    return () => { cancelled = true; };
  }, []);

  return null;
}
