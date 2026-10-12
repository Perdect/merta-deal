"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { ProductDetail } from "@/types/app";
import { addToCartAction, getCartSummary } from "@/lib/actions/cart";
import { ensureGuestSessionAction } from "@/lib/actions/guest";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { QuantityStepper } from "@/components/ui/misc";
import { ShoppingCart } from "lucide-react";
import { resolveOffer } from "./product-offer";
import { formatINR } from "@/lib/utils";

/**
 * Add to Cart for the product page: floats above the dock on mobile, sits under the gallery on
 * desktop. After adding it becomes a stepper + "Go to cart", both backed by the server cart.
 */
export function ProductBuyBar({ product, signedIn }: { product: ProductDetail; signedIn: boolean }) {
  const router = useRouter();
  const cartStoreId = useCartStore((s) => s.summary?.store?.id ?? null);
  const offer = React.useMemo(() => resolveOffer(product, cartStoreId), [product, cartStoreId]);
  const qty = useCartStore((s) => (offer ? s.qtyFor(offer.inventory_id) : 0));
  const subtotal = useCartStore((s) => s.summary?.subtotal ?? 0);
  const count = useCartStore((s) => s.totalCount());
  const setPending = useCartStore((s) => s.setPending);
  const setSummary = useCartStore((s) => s.setSummary);
  const openDrawer = useCartStore((s) => s.openDrawer);
  const [busy, setBusy] = React.useState(false);
  const [conflict, setConflict] = React.useState<{ current: string; next: string } | null>(null);

  const add = async (replace = false) => {
    if (!offer) return;
    setBusy(true);
    if (!signedIn) {
      const g = await ensureGuestSessionAction();
      if (!g.ok) { setBusy(false); router.push(`/login?next=${encodeURIComponent(`/p/${product.slug}`)}`); return; }
      if (g.created) router.refresh();
    }
    const target = qty + 1;
    setPending(offer.inventory_id, target);
    const res = await addToCartAction(offer.inventory_id, target, replace);
    if (!res.ok) {
      setPending(offer.inventory_id, null);
      if (res.conflict) setConflict({ current: res.conflict.current_store.name, next: res.conflict.new_store.name });
      else toast.error(res.error);
      setBusy(false); return;
    }
    setSummary(await getCartSummary()); setPending(offer.inventory_id, null);
    setBusy(false);
    toast.success("Added to cart");
  };
  const setQty = async (v: number) => {
    if (!offer) return;
    setPending(offer.inventory_id, v);
    const res = await addToCartAction(offer.inventory_id, v);
    if (!res.ok) { setPending(offer.inventory_id, null); toast.error(res.error); return; }
    setSummary(await getCartSummary()); setPending(offer.inventory_id, null);
  };
  const soldOut = !offer || offer.status === "out_of_stock";

  return (
    <>
      <div className="fixed inset-x-3 z-40 md:static md:inset-auto" style={{ bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 18px)" }}>
        <div className="rounded-2xl border border-line bg-card p-2 shadow-float md:border-0 md:bg-transparent md:p-0 md:shadow-none">
          {qty > 0 && offer ? (
            <div className="flex items-center gap-2">
              <QuantityStepper value={qty} onChange={setQty} min={0} max={Math.min(offer.max_order_qty, offer.stock_qty)} className="h-12 flex-1 justify-between rounded-xl px-1" />
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
      <ConfirmDialog open={Boolean(conflict)} onClose={() => setConflict(null)} title="Replace cart items?" confirmLabel="Replace cart"
        description={conflict ? `Your cart has items from ${conflict.current}. Orders are delivered from one store at a time, so we'll replace them with items from ${conflict.next}.` : null}
        onConfirm={() => { setConflict(null); add(true); }} />
    </>
  );
}
