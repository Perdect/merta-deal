"use client";
import * as React from "react";

/**
 * Silent service-worker updates — how a new release reaches an open app:
 *
 *  1. The browser finds a changed /sw.js (on its own schedule, on `reg.update()` here at mount and
 *     each time the tab comes back to the foreground after a while).
 *  2. The new worker installs in the background and waits. We post SKIP_WAITING as soon as it is
 *     `installed`, so it activates right away and takes over the open tabs (`clients.claim()` in sw.js).
 *  3. Nothing is reloaded. There is deliberately no `controllerchange → location.reload()`:
 *     a half-filled address form, a cart edit or a payment in progress would be lost. HTML and API
 *     responses are never served from the cache, and /_next/static files are content-hashed, so the
 *     page that is open keeps working with the files it already has and the very next navigation
 *     (any link or form submit; Next's full navigations and server actions always hit the network)
 *     runs on the new version.
 *
 * Registration itself lives in PwaClient; this attaches to the existing registration.
 */
const RECHECK_MS = 30 * 60 * 1000;

export function UpdatePrompt() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    let lastCheck = Date.now();
    const activate = (sw: ServiceWorker | null) => { if (sw && navigator.serviceWorker.controller) sw.postMessage({ type: "SKIP_WAITING" }); };
    let onVisible: (() => void) | undefined;

    navigator.serviceWorker.ready.then((reg) => {
      if (cancelled) return;
      activate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        installing?.addEventListener("statechange", () => { if (installing.state === "installed") activate(installing); });
      });
      reg.update().catch(() => {});
      // Installed apps stay open for days; check again when the customer comes back to the tab.
      onVisible = () => {
        if (document.visibilityState !== "visible" || Date.now() - lastCheck < RECHECK_MS) return;
        lastCheck = Date.now();
        reg.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", onVisible);
    }).catch(() => {});

    return () => { cancelled = true; if (onVisible) document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  return null;
}
