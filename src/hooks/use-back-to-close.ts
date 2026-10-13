"use client";
import * as React from "react";

let depth = 0;

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
    skipRef.current = false;
    const my = ++depth;
    const href = location.href;
    history.pushState({ ...(history.state ?? {}), mdOverlay: my }, "");
    let poppedHere = false;
    const onPop = () => {
      const cur = (history.state as { mdOverlay?: number } | null)?.mdOverlay ?? 0;
      if (cur < my) { poppedHere = true; closeRef.current(); }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      depth = Math.max(0, my - 1);
      if (!poppedHere && !skipRef.current && location.href === href && (history.state as { mdOverlay?: number } | null)?.mdOverlay === my) history.back();
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
