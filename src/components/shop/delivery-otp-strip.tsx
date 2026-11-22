"use client";
import * as React from "react";
import { Eye, EyeOff, Phone, ShieldCheck } from "lucide-react";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

/** How long the code stays on screen after a tap before it covers itself again. */
const HIDE_AFTER_MS = 30_000;

/**
 * The customer's delivery OTP while the order is out for delivery. Covered until tapped so it is not
 * read over a shoulder, and it covers itself again after half a minute or when the app goes to the
 * background. It comes from the server on every load, so it survives refreshes and reopening, and it
 * is never sent by SMS or WhatsApp — this card is the only place it appears.
 */
export function DeliveryOtpStrip({ otp, locked, className }: { otp: string | null | undefined; locked?: boolean | null; className?: string }) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), HIDE_AFTER_MS);
    const onHide = () => { if (document.visibilityState === "hidden") setShown(false); };
    document.addEventListener("visibilitychange", onHide);
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", onHide); };
  }, [shown]);

  if (locked) {
    return (
      <section className={cn("rounded-xl border border-danger/30 bg-danger-50 p-4 text-sm", className)} role="status">
        <p className="font-bold text-ink">Delivery OTP locked after too many wrong tries</p>
        <p className="mt-0.5 text-ink-2">Call support — they confirm the handover with you and complete the delivery.</p>
        <a href={`tel:+${site.supportPhone.replace(/\D/g, "")}`} className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-bold text-brand-700"><Phone className="h-4 w-4" aria-hidden /> {site.supportPhone}</a>
      </section>
    );
  }
  if (!otp) return null;
  const digits = otp.split("");
  return (
    <section aria-labelledby="otp-title" className={cn("rounded-xl border border-saffron-300 bg-saffron-50 p-4 shadow-card", className)}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-saffron-100 text-saffron-700"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0">
          <h2 id="otp-title" className="font-sans text-[15px] font-bold leading-snug tracking-normal text-ink">Delivery OTP</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-2">For the rider, at your door</p>
        </div>
      </div>

      <button type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown} aria-label={shown ? "Hide delivery OTP" : "Show delivery OTP"}
        className="tap mt-3 flex w-full items-center justify-between gap-3 rounded-lg bg-card px-3 py-2.5 text-left shadow-card transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron-600">
        <span className="flex gap-1.5" aria-hidden>
          {digits.map((d, i) => (
            <span key={i} className="flex h-11 w-9 items-center justify-center rounded-lg border border-line bg-surface font-display text-xl font-extrabold tabular text-ink min-[400px]:w-10">{shown ? d : "•"}</span>
          ))}
        </span>
        <span className="sr-only" aria-live="polite">{shown ? `Your delivery OTP is ${digits.join(" ")}` : "Delivery OTP hidden"}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-bold text-saffron-700">{shown ? <><EyeOff className="h-4 w-4" aria-hidden />Hide</> : <><Eye className="h-4 w-4" aria-hidden />Tap to reveal</>}</span>
      </button>

      <p className="mt-2.5 text-xs leading-relaxed text-ink-2">
        Share it only after the order is in your hands. Don&rsquo;t read it out on a call or send it in a message; it is shown here and nowhere else.
      </p>
    </section>
  );
}
