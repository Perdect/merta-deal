"use client";
import * as React from "react";

let depth = 0;
/* history.back() calls made by closing panels whose popstate has not landed yet. A panel that opens
   meanwhile must not push its entry before that pop lands, or the pop would land on its entry and
   close it at once (the location picker opening the address sheet was undone exactly like this). */
let pendingPops = 0;
let popWatcher = false;
function watchPops() {
  if (popWatcher || typeof window === "undefined") return;
  popWatcher = true;
  window.addEventListener("popstate", () => { if (pendingPops > 0) pendingPops -= 1; });
}

/**
 * Browser/phone Back closes the top-most open panel (cart, sheet, dialog) instead of leaving the page.
 * Opening pushes a same-URL history entry tagged with the panel's depth; Back pops it and closes the
 * panel. Closing from the UI removes the entry again — unless the user navigated away meanwhile,
 * so a link tapped inside a panel is never undone.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  const closeRef = React.useRef(onClose);
  const skipRef = React.useRef(false);
  React.useEffect(() => { closeRef.current = onClose; });
  React.useEffect(() => {
    if (!open) return;
    watchPops();
    skipRef.current = false;
    let my = 0; let href = ""; let pushed = false; let poppedHere = false; let cancelled = false;
    let waitTimer: ReturnType<typeof setTimeout> | null = null;
    const onPop = () => {
      const cur = (history.state as { mdOverlay?: number } | null)?.mdOverlay ?? 0;
      if (cur < my) { poppedHere = true; closeRef.current(); }
    };
    const arm = () => {
      if (cancelled || pushed) return;
      my = ++depth; href = location.href; pushed = true;
      history.pushState({ ...(history.state ?? {}), mdOverlay: my }, "");
      window.addEventListener("popstate", onPop);
    };
    const waitForPop = () => { window.removeEventListener("popstate", waitForPop); if (waitTimer) clearTimeout(waitTimer); setTimeout(arm, 0); };
    if (pendingPops > 0) {
      // The watcher above runs first and settles the counter; then this panel takes its entry.
      window.addEventListener("popstate", waitForPop);
      waitTimer = setTimeout(waitForPop, 600);
    } else arm();
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", waitForPop); window.removeEventListener("popstate", onPop);
      if (waitTimer) clearTimeout(waitTimer);
      if (!pushed) return;
      depth = Math.max(0, my - 1);
      if (!poppedHere && !skipRef.current && location.href === href && (history.state as { mdOverlay?: number } | null)?.mdOverlay === my) { pendingPops += 1; history.back(); }
    };
  }, [open]);
  /** Call right before closing the panel to navigate elsewhere (e.g. after placing an order). */
  return React.useCallback(() => { skipRef.current = true; }, []);
}

/**
 * Run a navigation after an overlay that uses useBackToClose has closed. Closing pops the overlay's history
 * entry (history.back(), which completes asynchronously); navigating in the same tick gets undone by that pop.
 * Waits for the popstate (or a short fallback when the overlay had no entry), then runs `fn`.
 */
export function afterOverlayClose(fn: () => void) {
  let done = false;
  const run = () => { if (done) return; done = true; window.removeEventListener("popstate", run); setTimeout(fn, 0); };
  window.addEventListener("popstate", run);
  setTimeout(run, 400);
}
