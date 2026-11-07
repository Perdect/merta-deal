"use client";
import * as React from "react";
import { Banknote, Wallet, Smartphone, Home, Briefcase, MapPin } from "lucide-react";
import type { Address, PaymentMethod } from "@/types/app";
import { BottomSheet } from "@/components/ui/overlay";
import { LogoMark } from "@/components/ui/misc";
import { addressLine, addressTitle } from "@/stores/location-store";
import { cn, formatINR } from "@/lib/utils";

/** How long the sheet waits before placing the order on its own. Tapping the button places it at once. */
const AUTO_PLACE_MS = 5000;
const ONLINE: PaymentMethod[] = ["upi", "card", "netbanking"];
const TYPE_ICON = { home: Home, work: Briefcase, other: MapPin };

function payLine(payment: PaymentMethod, upi: boolean) {
  if (ONLINE.includes(payment)) return "You will pay online in the next step.";
  if (payment === "wallet") return "Paid from your Merta Wallet.";
  return upi ? "Pay by cash or UPI when your order arrives." : "Pay cash when your order arrives.";
}

/**
 * The last look before an order is placed: amount, how it is paid and where it goes. The button
 * fills over a few seconds and then places the order by itself, so one tap at checkout is enough,
 * while Cancel stops it. A second tap places it straight away. Nothing is ordered until onPlace runs.
 */
export function PlaceOrderSheet({ open, onClose, onPlace, address, total, payment, upi }: { open: boolean; onClose: () => void; onPlace: () => void; address: Address | null; total: number; payment: PaymentMethod; upi: boolean }) {
  const Icon = address ? TYPE_ICON[address.type] : MapPin;
  const online = ONLINE.includes(payment);
  return (
    <BottomSheet open={open} onClose={onClose} title="Ordering now" description={payLine(payment, upi)}>
      <ul className="mt-2 divide-y divide-dashed divide-line">
        <li className="flex items-center gap-3 py-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-brand-700">{online ? <Smartphone className="h-5 w-5" /> : payment === "wallet" ? <Wallet className="h-5 w-5" /> : <Banknote className="h-5 w-5" />}</span>
          <span><span className="block font-display text-lg font-bold text-ink tabular">{formatINR(total, { precise: true })}</span><span className="block text-sm text-ink-3">{online ? "Amount to pay now" : "Amount to pay"}</span></span>
        </li>
        <li className="flex items-center gap-3 py-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-3"><Icon className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="block text-base font-bold text-ink">Delivering to {address ? addressTitle(address) : "your address"}</span>{address ? <span className="line-clamp-1 text-sm text-ink-3">{addressLine(address)}</span> : null}</span>
        </li>
      </ul>
      <PlaceButton onPlace={onPlace} label={online ? "Pay now" : "Place order now"} ariaLabel={online ? `Pay ${formatINR(total, { precise: true })} now` : "Place order now"} />
      <button type="button" onClick={onClose} className="tap mt-1 flex h-11 w-full items-center justify-center rounded-md text-base font-bold text-danger hover:bg-danger-50">Cancel order</button>
      <p className="mt-1 text-center text-[11px] text-ink-4">Places on its own in a few seconds. Tap Cancel to stop.</p>
    </BottomSheet>
  );
}

/** Mounted fresh each time the sheet opens (the sheet unmounts its children when closed), so the fill and the timer always start from zero. */
function PlaceButton({ onPlace, label, ariaLabel }: { onPlace: () => void; label: string; ariaLabel: string }) {
  const [armed, setArmed] = React.useState(false);
  const fired = React.useRef(false);
  const place = React.useCallback(() => { if (fired.current) return; fired.current = true; onPlace(); }, [onPlace]);
  React.useEffect(() => {
    // Arm on the next frame so the width transition runs from 0; place when the fill completes.
    const raf = requestAnimationFrame(() => setArmed(true));
    const auto = setTimeout(place, AUTO_PLACE_MS);
    return () => { cancelAnimationFrame(raf); clearTimeout(auto); };
  }, [place]);
  return (
    <button type="button" onClick={place} aria-label={ariaLabel}
      className="tap relative mt-3 flex h-13 w-full items-center justify-center overflow-hidden rounded-xl bg-brand-600 text-base font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 bg-brand-800 motion-reduce:hidden", armed ? "w-full" : "w-0")} style={{ transition: armed ? `width ${AUTO_PLACE_MS}ms linear` : "none" }} />
      <span className="relative">{label}</span>
    </button>
  );
}

/** After this long the hold screen offers a way out, in case the order page never arrives. */
const SLOW_AFTER_MS = 15000;

/**
 * Full-screen hold while place_order runs, so a slow connection never shows a dead button. It is
 * only ever a hold: if the order page has not taken over after a while it offers My orders, since
 * the order may well have been placed by then.
 */
export function PlacingScreen({ open }: { open: boolean }) {
  return open ? <PlacingBody /> : null;
}

function PlacingBody() {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS); return () => clearTimeout(t); }, []);
  return (
    <div role="status" aria-live="assertive" className="fixed inset-0 z-[90] bg-card animate-fade-in motion-reduce:animate-none" style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}>
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <span className="relative flex h-28 w-28 items-center justify-center" aria-hidden>
          <span className="absolute inset-0 rounded-full bg-brand-100 animate-pulse-soft motion-reduce:animate-none" />
          <LogoMark size={72} className="relative drop-shadow-sm" />
        </span>
        <h1 className="mt-7 font-display text-2xl font-bold text-ink">Confirming your order…</h1>
        <p className="mt-2 text-sm text-ink-3">This takes a moment.</p>
        {slow ? <p className="mt-6 text-sm text-ink-2 animate-fade-in">Taking longer than usual. Your order may already be placed: <a href="/account/orders" className="font-bold text-brand-700 underline underline-offset-2">check My orders</a>.</p> : null}
      </div>
      <p className="absolute inset-x-0 bottom-0 bg-brand-50 px-6 py-3 text-center text-xs text-ink-2" style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}>Please don&rsquo;t close the app or go back until your order is confirmed.</p>
    </div>
  );
}
