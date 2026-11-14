"use client";
import * as React from "react";
import { ArrowRight, Clock, MapPin, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Full-screen confirmation shown once, right after checkout: a green hero with an animated tick and
 * the order number, then a white sheet carrying the arrival time, the delivery address and the one
 * thing left to do. It leaves on a tap or on its own after a few seconds, and the `?placed=1` flag is
 * dropped from the URL so a reload does not replay it. Every line here is real order data; when a
 * figure is missing (no promised time yet) its row is left out rather than guessed.
 */
export function OrderPlacedSplash({ orderId, orderNumber, confirmed, label, addressLine, etaLabel, codNote }: {
  orderId: string; orderNumber?: string | null; confirmed: boolean; label: string | null; addressLine: string; etaLabel?: string | null; codNote?: string | null;
}) {
  const [phase, setPhase] = React.useState<"in" | "out" | "gone">("in");
  const dismiss = React.useCallback(() => setPhase((p) => (p === "in" ? "out" : p)), []);

  React.useEffect(() => {
    // The flag has done its job: the purchase event fired and this splash is on screen.
    if (typeof window !== "undefined" && window.location.search.includes("placed=1")) window.history.replaceState(window.history.state, "", `/orders/${orderId}`);
    const hold = setTimeout(dismiss, 4500);
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
      className={cn("fixed inset-0 z-[80] flex flex-col bg-brand-700 text-white", phase === "out" && "opacity-0 transition-opacity duration-300")}>
      <button type="button" onClick={dismiss} aria-label="Skip"
        className="tap absolute right-4 z-10 rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold text-white backdrop-blur-sm"
        style={{ top: "calc(var(--safe-top) + 12px)" }}>Skip</button>

      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 text-center" style={{ paddingTop: "var(--safe-top)" }}>
        <Rings />
        <span className="relative flex h-28 w-28 items-center justify-center rounded-full bg-white text-brand-700 shadow-[0_12px_40px_rgb(0_0_0/0.25)] animate-tick-pop" aria-hidden>
          <span className="absolute inset-0 rounded-full bg-white/60 animate-tick-ring" />
          <svg viewBox="0 0 24 24" className="relative h-14 w-14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 12.5 10 17.5 19 7.5" pathLength={1} className="animate-tick-draw" style={{ strokeDasharray: 1, strokeDashoffset: 1 }} />
          </svg>
        </span>
        <h1 className="relative mt-8 font-display text-[30px] font-extrabold leading-tight animate-rise" style={{ animationDelay: "0.35s" }}>
          {confirmed ? "Order confirmed" : "Order placed"}
        </h1>
        <p className="relative mt-2 max-w-[18rem] text-sm text-white/75 animate-rise" style={{ animationDelay: "0.45s" }}>
          {confirmed ? "We are packing it now. Thank you for shopping local." : "We have it. Thank you for shopping local."}
        </p>
        {orderNumber ? (
          <span className="relative mt-5 inline-flex items-center rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold tracking-wide text-white animate-rise" style={{ animationDelay: "0.55s" }}>
            {orderNumber}
          </span>
        ) : null}
      </div>

      <div className="relative mx-auto w-full max-w-md rounded-t-[28px] bg-card px-5 pt-5 text-ink shadow-[0_-12px_40px_rgb(0_0_0/0.22)] animate-slide-up sm:mb-6 sm:rounded-[28px]"
        style={{ animationDelay: "0.3s", paddingBottom: "calc(var(--safe-bottom) + 20px)" }}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-2" aria-hidden />
        <ul className="space-y-3.5">
          {etaLabel ? <Row icon={<Clock className="h-4 w-4" aria-hidden />} title="Arriving by" body={etaLabel} /> : null}
          <Row icon={<MapPin className="h-4 w-4" aria-hidden />} title={label ? `Delivering to ${label}` : "Delivering to"} body={addressLine} />
          {codNote ? <Row icon={<Wallet className="h-4 w-4" aria-hidden />} title="Pay on delivery" body={codNote} /> : null}
        </ul>
        {!confirmed ? <p className="mt-4 rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs text-ink-2">We will confirm it as soon as payment is received.</p> : null}
        <button type="button" onClick={dismiss}
          className="tap mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-base font-bold text-white">
          Track your order <ArrowRight className="h-4.5 w-4.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Row({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</span>
        <span className="block text-sm font-semibold text-ink">{body}</span>
      </span>
    </li>
  );
}

/** Soft concentric rings behind the tick, the same device the rider and admin sign-in screens use. */
function Rings() {
  return (
    <svg viewBox="0 0 400 400" className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 text-white" aria-hidden>
      <g fill="none" stroke="currentColor" strokeOpacity="0.12">
        <circle cx="200" cy="200" r="78" />
        <circle cx="200" cy="200" r="118" />
        <circle cx="200" cy="200" r="162" strokeOpacity="0.08" />
      </g>
    </svg>
  );
}
