"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { ProductDetail } from "@/types/app";
import { ensureGuestSessionAction } from "@/lib/actions/guest";
import { useCartStore } from "@/stores/cart-store";
import { packLimit, setLineQuantity } from "@/lib/cart-sync";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/ui/misc";
import { ShoppingCart } from "lucide-react";
import { resolveOffer } from "./product-offer";
import { formatINR } from "@/lib/utils";

/**
 * Add to Cart for the product page: floats above the dock on mobile, sits under the gallery on
 * desktop. After adding it becomes a stepper + "Go to cart", both backed by the server cart.
 * Quantity is in packs (pack size shown under the stepper); the + stops at the product's limit.
 */
export function ProductBuyBar({ product, signedIn }: { product: ProductDetail; signedIn: boolean }) {
  const router = useRouter();
  const offer = React.useMemo(() => resolveOffer(product), [product]);
  const qty = useCartStore((s) => (offer ? s.qtyFor(offer.inventory_id) : 0));
  const subtotal = useCartStore((s) => s.summary?.subtotal ?? 0);
  const count = useCartStore((s) => s.totalCount());
  const syncing = useCartStore((s) => (offer ? offer.inventory_id in s.pending : false));
  const openDrawer = useCartStore((s) => s.openDrawer);
  const [busy, setBusy] = React.useState(false);

  const limit = packLimit(offer?.max_order_qty, offer?.stock_qty);

  const add = async () => {
    if (!offer) return;
    setBusy(true);
    if (!signedIn) {
      const g = await ensureGuestSessionAction();
      if (!g.ok) { setBusy(false); router.push(`/login?next=${encodeURIComponent(`/p/${product.slug}`)}`); return; }
      if (g.created) router.refresh();
    }
    await setLineQuantity(offer.inventory_id, Math.min(qty + 1, Math.max(limit.max, 1)));
    setBusy(false);
    // No "Added to cart" toast: the bar switches to the quantity stepper and the cart badge updates.
  };
  const setQty = (v: number) => {
    if (!offer) return;
    if (v === limit.max && v > qty) toast.info(limit.message, "That's the most you can add of this item.");
    void setLineQuantity(offer.inventory_id, v);
  };
  const soldOut = !offer || offer.status === "out_of_stock";

  return (
    <>
      <div className="fixed inset-x-3 z-40 md:static md:inset-auto" style={{ bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 8px)" }}>
        <div className="rounded-2xl border border-line bg-card p-2 shadow-float md:border-0 md:bg-transparent md:p-0 md:shadow-none">
          {qty > 0 && offer ? (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 flex-col">
                <QuantityStepper value={qty} onChange={setQty} min={0} max={limit.max} maxLabel={limit.message} loading={syncing} className="h-12 w-full justify-between rounded-xl px-1" />
                <p className={`mt-1 text-center text-[11px] leading-tight ${qty >= limit.max ? "font-semibold text-saffron-700" : "text-ink-3"}`} aria-live="polite">{qty >= limit.max ? limit.message : product.pack_label ? `${qty} × ${product.pack_label} pack` : `${qty} ${qty === 1 ? "pack" : "packs"}`}</p>
              </div>
              <Button size="lg" className="h-12 flex-1 rounded-xl text-[15px]" onClick={() => openDrawer("cart")}>Go to cart · {formatINR(subtotal)}</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {/* Cart shortcut with the live count, like the app; the desktop header already has one. */}
              <button type="button" onClick={() => openDrawer("cart")} aria-label={`Cart, ${count} items`} className="relative flex h-13 w-14 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-ink md:hidden">
                <ShoppingCart className="h-6 w-6" />
                {count > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-saffron-500 px-1 text-[11px] font-bold text-ink">{count}</span> : null}
              </button>
              <Button size="lg" fullWidth disabled={soldOut} loading={busy} onClick={() => add()} className="h-13 flex-1 rounded-xl text-base">{soldOut ? "Currently unavailable" : "Add to Cart"}</Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
