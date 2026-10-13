"use client";
import * as React from "react";
import { Eye, EyeOff, ShieldCheck, Phone } from "lucide-react";
import { site } from "@/config/site";

/**
 * Customer's delivery OTP while the order is out for delivery. Hidden until tapped so it isn't read
 * over a shoulder; it comes from the server on every load, so it survives refreshes and reopening.
 * Never sent by SMS/WhatsApp — this strip is the only place it appears.
 */
export function DeliveryOtpStrip({ otp, locked }: { otp: string | null | undefined; locked?: boolean | null }) {
  const [shown, setShown] = React.useState(false);
  if (locked) {
    return (
      <div className="mt-4 rounded-xl border border-danger/30 bg-danger-50 p-3 text-sm" role="status">
        <p className="font-bold text-ink">Delivery OTP locked after too many wrong tries</p>
        <p className="mt-0.5 text-ink-2">Call support — they confirm the handover with you and complete the delivery.</p>
        <a href={`tel:+${site.supportPhone.replace(/\D/g, "")}`} className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-bold text-brand-700"><Phone className="h-4 w-4" /> {site.supportPhone}</a>
      </div>
    );
  }
  if (!otp) return null;
  return (
    <button type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown} aria-label={shown ? "Hide delivery OTP" : "Show delivery OTP"}
      className="mt-4 flex w-full items-center gap-3 rounded-xl border border-saffron-300 bg-saffron-50 p-3 text-left transition-colors hover:bg-saffron-100">
      <ShieldCheck className="h-6 w-6 shrink-0 text-saffron-700" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-ink">
          Delivery OTP: <span className="font-display text-xl font-extrabold tracking-[0.3em] tabular" aria-live="polite">{shown ? otp : "••••"}</span>
        </span>
        <span className="block text-xs text-ink-2">Share with your rider after receiving your order.</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-saffron-700">{shown ? <><EyeOff className="h-4 w-4" />Hide</> : <><Eye className="h-4 w-4" />Tap to view</>}</span>
    </button>
  );
}
