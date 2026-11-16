import { Tag } from "lucide-react";
import type { WelcomeOffer } from "@/lib/data/home";
import { formatINR } from "@/lib/utils";

/**
 * The welcome coupon in one line under the search bar, which is all that is left of the green hero
 * the home screen used to open with. It states the live coupon and nothing else: the value, the code
 * to type at checkout and the minimum that unlocks it, all read from the coupons table. No coupon
 * live, no line — the home never advertises a code a customer would then be refused.
 */
export function WelcomeOfferLine({ offers }: { offers: WelcomeOffer[] }) {
  // The data layer puts the welcome coupon first; a destination-only code is never shown here.
  const best = offers[0];
  if (!best) return null;
  const value = best.isPercent ? `${best.discount}% off` : `${formatINR(best.discount)} off`;
  return (
    <p className="mx-4 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-[13px] leading-snug text-brand-800 sm:mx-0 sm:text-sm">
      <Tag className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      <span>
        {value} with code <strong className="font-bold tracking-wide">{best.code}</strong>
        {best.minOrder > 0 ? ` on orders above ${formatINR(best.minOrder)}` : ""}
      </span>
    </p>
  );
}
