"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ensureGuestSessionAction } from "@/lib/actions/guest";
import { packLimit, setLineQuantity } from "@/lib/cart-sync";
import { useCartStore } from "@/stores/cart-store";
import { useSignedIn, notifySessionChanged } from "@/stores/me-store";
import { toast } from "@/components/ui/toast";
import { QuantityStepper } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

type Props = { inventoryId: string | null; maxQty?: number | null; stockQty?: number | null; size?: "sm" | "md"; className?: string; stepperClassName?: string; label?: string; signedIn?: boolean; fullWidth?: boolean };

/**
 * ADD button that turns into a − qty + stepper (quantity = packs). Shared cart state, so every card
 * for the same product shows the same number. Limits: the product's max per order, or the stock if
 * lower; the server enforces them too. Taps are queued, never dropped.
 */
/** `className` styles the ADD button; `stepperClassName` styles the quantity control that replaces it. */
export function AddToCart({ inventoryId, maxQty, stockQty, size = "md", className, stepperClassName, label = "ADD", signedIn: signedInProp, fullWidth }: Props) {
  const router = useRouter();
  const signedInStore = useSignedIn();
  const signedIn = signedInProp ?? signedInStore;
  const openSheet = useCartStore((s) => s.openSheet);
  const setAdded = useCartStore((s) => s.setAdded);
  const qty = useCartStore((s) => (inventoryId ? s.qtyFor(inventoryId) : 0));
  const syncing = useCartStore((s) => (inventoryId ? inventoryId in s.pending : false));
  const [starting, setStarting] = React.useState(false);
  const outOfStock = !inventoryId || (stockQty != null && stockQty <= 0);
  const limit = packLimit(maxQty, stockQty);

  const update = async (next: number) => {
    if (!inventoryId) return;
    if (!signedIn && qty === 0) {
      setStarting(true);
      const g = await ensureGuestSessionAction();
      setStarting(false);
      // Guest sessions are the norm (Supabase anonymous sign-in); only when that is switched off is a sign-in asked for here.
      if (!g.ok) { toast.info("Sign in to add items", g.error); openSheet("login"); return; }
      if (g.created) { notifySessionChanged(); router.refresh(); }
    }
    const first = qty === 0 && next > 0;
    if (next === limit.max && next > qty) toast.info(limit.message, "That's the most you can add of this item.");
    const res = await setLineQuantity(inventoryId, next);
    // No toast: the button turns into the quantity stepper and the cart bar/badge update (a toast covered the header).
    // On wide screens the header shows an "Added to Cart" card for the first pack of a product.
    if (res.ok && first) { setAdded(inventoryId); track("add_to_cart", { items: [{ item_id: inventoryId, quantity: next }] }); }
  };

  if (outOfStock) {
    return <span className={cn("inline-flex items-center justify-center rounded-sm border border-line-2 bg-surface-2 px-3 text-xs font-semibold text-ink-3", size === "sm" ? "h-8" : "h-9", fullWidth && "w-full", className)}>Out of stock</span>;
  }

  return (
    <>
      {qty > 0 ? (
        <QuantityStepper value={qty} onChange={(v) => update(v)} min={0} max={limit.max} maxLabel={limit.message} size={size} loading={syncing} className={cn("motion-safe:animate-pop", fullWidth && "w-full justify-between", stepperClassName)} />
      ) : (
        <button type="button" onClick={() => update(1)} disabled={starting}
          className={cn("tap inline-flex items-center justify-center gap-1 rounded-sm border border-brand-600 bg-brand-50 font-bold text-brand-700 transition-[background-color,transform] duration-150 hover:bg-brand-100 active:scale-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600", size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm", fullWidth && "w-full", className)}>
          {label}<Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  );
}
