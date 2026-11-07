"use client";
import * as React from "react";

/**
 * Full-screen confirmation shown once, right after checkout: a green tick, "Order Confirmed" and the
 * delivery address, then the tracking page underneath. It leaves on its own after a few seconds or
 * on a tap, and the `?placed=1` flag is dropped from the URL so a reload does not replay it.
 */
export function OrderPlacedSplash({ orderId, confirmed, label, addressLine, codNote }: { orderId: string; confirmed: boolean; label: string | null; addressLine: string; codNote?: string | null }) {
  const [phase, setPhase] = React.useState<"in" | "out" | "gone">("in");
  const dismiss = React.useCallback(() => setPhase((p) => (p === "in" ? "out" : p)), []);

  React.useEffect(() => {
    // The flag has done its job: the purchase event fired and this splash is on screen.
    if (typeof window !== "undefined" && window.location.search.includes("placed=1")) window.history.replaceState(window.history.state, "", `/orders/${orderId}`);
    const hold = setTimeout(dismiss, 3200);
    return () => clearTimeout(hold);
  }, [orderId, dismiss]);
  React.useEffect(() => {
    if (phase !== "out") return;
    const t = setTimeout(() => setPhase("gone"), 350);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;
  return (
    <div role="status" aria-live="polite" onClick={dismiss}
      className={phase === "out" ? "fixed inset-0 z-[80] bg-card transition-opacity duration-300 opacity-0" : "fixed inset-0 z-[80] bg-card"}
      style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}>
      <button type="button" onClick={dismiss} className="tap absolute right-4 rounded-md border border-line-2 bg-card px-4 py-2 text-sm font-bold text-ink" style={{ top: "calc(var(--safe-top) + 12px)" }}>Skip</button>
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-success text-white animate-tick-pop" aria-hidden>
          <span className="absolute inset-0 rounded-full bg-success animate-tick-ring" />
          <svg viewBox="0 0 24 24" className="relative h-12 w-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 12.5 10 17.5 19 7.5" pathLength={1} className="animate-tick-draw" style={{ strokeDasharray: 1, strokeDashoffset: 1 }} />
          </svg>
        </span>
        <h1 className="mt-7 font-display text-2xl font-bold text-ink animate-rise" style={{ animationDelay: "0.35s" }}>{confirmed ? "Order Confirmed" : "Order Placed"}</h1>
        <div className="mt-5 animate-rise" style={{ animationDelay: "0.5s" }}>
          <p className="text-sm text-ink-2">Delivering to{label ? <> - <span className="font-bold text-ink">{label}</span></> : null}</p>
          <p className="mt-1 text-xs text-ink-3">{addressLine}</p>
          {codNote ? <p className="mt-3 text-xs font-semibold text-ink-2">{codNote}</p> : null}
          {!confirmed ? <p className="mt-3 text-xs text-ink-3">We will confirm it as soon as payment is received.</p> : null}
        </div>
        <p className="mt-10 text-[11px] text-ink-4 animate-fade-in" style={{ animationDelay: "1.2s" }}>Tap to track your order</p>
      </div>
    </div>
  );
}
