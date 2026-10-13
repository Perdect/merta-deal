"use client";
import * as React from "react";
import { BadgePercent } from "lucide-react";
import type { WelcomeOffer } from "@/lib/data/home";
import { BottomSheet } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";

const KEY = "md-offers-sheet-seen";
const DAY = 24 * 60 * 60 * 1000;

/**
 * "Shop more, save more": the live site-wide coupons as tiers (lowest minimum first), shown at most
 * once a day, a moment after the home page settles. Never right after arriving from a search engine
 * (Google treats an immediate pop-up on landing as an intrusive interstitial). Every value comes from
 * the coupons table; the server re-checks the coupon when it is applied in the cart.
 */
export function OffersSheet({ offers }: { offers: WelcomeOffer[] }) {
  const [open, setOpen] = React.useState(false);
  const tiers = React.useMemo(() => [...offers].sort((a, b) => a.minOrder - b.minOrder).slice(0, 4), [offers]);

  React.useEffect(() => {
    if (!tiers.length) return;
    try {
      const last = Number(localStorage.getItem(KEY) ?? 0);
      if (Date.now() - last < DAY) return;
      if (/google\.|bing\.|duckduckgo\.|yahoo\./i.test(document.referrer)) return;
    } catch { return; }
    const t = setTimeout(() => {
      // Wait for the launch splash to be gone, and don't stack on another open dialog.
      const splash = document.getElementById("md-splash");
      if (document.querySelector('[role="dialog"]') || (splash && getComputedStyle(splash).visibility === "visible")) return;
      setOpen(true);
      try { localStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ }
    }, 2500);
    return () => clearTimeout(t);
  }, [tiers.length]);

  if (!tiers.length) return null;
  return (
    <BottomSheet open={open} onClose={() => setOpen(false)} title="Shop more, save more">
      <div className="relative -mx-1 space-y-3 px-1 pb-1 pt-1">
        {tiers.map((o, i) => (
          <div key={o.code} className={`flex items-center gap-4 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-card px-4 py-3.5 shadow-card ${i % 2 ? "ml-6" : "mr-6"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-display text-2xl font-extrabold leading-none tracking-tight text-brand-800">{o.isPercent ? `${o.discount}% OFF` : `${formatINR(o.discount)} OFF`}</p>
              <p className="mt-1.5 text-sm font-semibold text-ink-2">{o.minOrder > 0 ? <>above {formatINR(o.minOrder)}</> : "on any order"}{o.isPercent && o.maxDiscount ? <span className="font-normal text-ink-3"> · up to {formatINR(o.maxDiscount)}</span> : null}</p>
              <p className="mt-1 text-xs text-ink-3">Code <b className="tracking-wide text-ink">{o.code}</b></p>
            </div>
            <span className="flex h-12 w-12 shrink-0 rotate-[-8deg] items-center justify-center rounded-xl bg-saffron-500 text-white shadow-card"><BadgePercent className="h-6 w-6" /></span>
          </div>
        ))}
        <p className="pt-1 text-center text-xs text-ink-3">Apply the coupon in your cart to claim</p>
        <Button size="lg" fullWidth className="h-12 rounded-xl text-base" onClick={() => setOpen(false)}>Order now</Button>
      </div>
    </BottomSheet>
  );
}
