"use client";
import * as React from "react";
import { MapPin, ChevronDown, AlertCircle } from "lucide-react";
import type { Address, CartSummary } from "@/types/app";
import { acknowledgeCartPricesAction } from "@/lib/actions/cart";
import { saveGuestContactAction } from "@/lib/actions/guest";
import { toast } from "@/components/ui/toast";
import { useCartStore } from "@/stores/cart-store";
import { useCheckoutStore } from "@/stores/checkout-store";
import { cn, formatINR } from "@/lib/utils";
import { addressLine, addressTitle } from "./address-sheet";

/**
 * The order of steps on the way to paying — shop → address → sign in → pay — in one place, so the
 * cart panel and the /cart page behave the same:
 *   no address            → "Add Address to proceed" (address sheet; guests included)
 *   address not served    → "Change address"
 *   guest                 → "Proceed to Pay" saves the address's name + mobile on the guest profile (no OTP)
 *                           and opens the payment step; the order is placed under that number
 *   guest, OTP required   → setting `order_mobile_otp_required` on: signing in comes FIRST, before the address.
 *                           "Login to Proceed" opens sign-in (mobile → OTP); once the code is checked the same steps
 *                           carry on for the account with the cart kept (address if there is none, then payment).
 *                           The server refuses a guest's order regardless: trigger in 0057
 *   no session at all     → "Login to Proceed" opens sign-in (only when guest sessions are switched off)
 *   signed in             → "Proceed to Pay" opens the payment step
 * The rules (minimum order, stock, serviceability) come from cart_summary, never from here.
 */
export function useCheckoutGate({ summary, addresses: serverAddresses, signedIn, isGuest, verifyMobile = false }: { summary: CartSummary | null; addresses: Address[]; signedIn: boolean; isGuest: boolean; /** Setting `order_mobile_otp_required`: a guest confirms the number by OTP before paying. */ verifyMobile?: boolean }) {
  const added = useCheckoutStore((s) => s.added);
  const chosenId = useCheckoutStore((s) => s.addressId);
  const setResume = useCheckoutStore((s) => s.setResume);
  const openSheet = useCartStore((s) => s.openSheet);
  const openDrawer = useCartStore((s) => s.openDrawer);
  const pendingCount = useCartStore((s) => Object.keys(s.pending).length);

  // Addresses come from the server; ones saved in this session are merged in until the layout re-renders
  // with them. The chosen address falls back to the default / first one, so a stale choice can never point
  // at a deleted row.
  const addresses = React.useMemo(() => [...added.filter((a) => !serverAddresses.some((x) => x.id === a.id)), ...serverAddresses], [added, serverAddresses]);
  const addressId = chosenId && addresses.some((a) => a.id === chosenId) ? chosenId : (addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? null);
  const selectedAddress = addresses.find((a) => a.id === addressId) ?? null;

  const s = summary;
  const cartBlocker = !s ? null
    : !s.meets_min_order ? `Minimum order is ${formatINR(s.min_order_amount)}. Add ${formatINR(s.min_order_amount - s.subtotal)} more to continue.`
    : s.issues.length ? "Some items are no longer available in the quantity you chose. Update the quantities to continue."
    : null;
  const unserved = Boolean(selectedAddress && s && !s.serviceable);
  const mustVerify = verifyMobile && isGuest;
  const needsLogin = !signedIn || mustVerify;

  const ctaLabel = mustVerify ? "Login to Proceed" : !selectedAddress ? "Add Address to proceed" : unserved ? "Change address" : needsLogin ? "Login to Proceed" : `Proceed to Pay ${formatINR(s?.total ?? 0, { precise: true })}`;
  const ctaDisabled = !mustVerify && Boolean(selectedAddress && !unserved && (cartBlocker || pendingCount > 0));

  const proceed = async () => {
    if (mustVerify) { setResume("pay"); openSheet("login"); return; }
    if (!selectedAddress || unserved) { openSheet("address"); return; }
    if (cartBlocker) return;
    if (needsLogin) { setResume("pay"); openSheet("login"); return; }
    if (isGuest) {
      const r = await saveGuestContactAction({ full_name: selectedAddress.full_name, phone: selectedAddress.phone });
      if (!r.ok) { toast.error(r.error); openSheet("address"); return; }
    }
    if (s?.items.some((l) => l.price_changed)) await acknowledgeCartPricesAction();
    openDrawer("pay");
  };

  return { addresses, addressId, selectedAddress, cartBlocker, unserved, serviceMessage: s?.service_message ?? null, needsLogin, mustVerify, ctaLabel, ctaDisabled, proceed };
}

/** "Delivering to Home · 12, Sadar Bazaar" with a tap target to change it (cart header / cart page). */
export function DeliveryAddressRow({ address, unserved, serviceMessage, onChange, className, compact }: { address: Address | null; unserved: boolean; serviceMessage: string | null; onChange: () => void; className?: string; /** No leading icon (panel header). */ compact?: boolean }) {
  if (!address) return null;
  return (
    <button type="button" onClick={onChange} aria-label={`Delivery address: ${addressTitle(address)}, ${addressLine(address)}. Change`} className={cn("flex w-full items-start gap-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600", className)}>
      {compact ? null : <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", unserved ? "bg-danger-50 text-danger" : "bg-brand-50 text-brand-700")}>{unserved ? <AlertCircle className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[15px] font-bold leading-tight text-ink">{addressTitle(address)} <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" aria-hidden /></span>
        <span className="block truncate text-xs text-ink-3">{addressLine(address)}</span>
        {unserved ? <span className="mt-0.5 block text-xs font-semibold text-danger">{serviceMessage ?? "We don't deliver to this address yet."} Tap to change.</span> : null}
      </span>
    </button>
  );
}
