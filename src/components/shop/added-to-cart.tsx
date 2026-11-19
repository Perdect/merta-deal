"use client";
import * as React from "react";
import { CheckCircle2, ChevronRight, X } from "lucide-react";
import { useCartStore } from "@/stores/cart-store";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import { ProductImage } from "./product-image";

const SHOW_MS = 6000;

/**
 * "Added to Cart" card under the header's cart button on wide screens, shown when the first pack of a
 * product goes in: the product, its pack and price as the cart holds them, and a way into the cart.
 * It reads the line from the cart summary (the server's answer), so nothing appears for an add the
 * server refused. It never takes focus, closes itself after a few seconds, and stays out of the way
 * while the cart panel is open. Phones have the cart bar at the bottom instead.
 */
export function AddedToCart() {
  const added = useCartStore((s) => s.added);
  const setAdded = useCartStore((s) => s.setAdded);
  const openDrawer = useCartStore((s) => s.openDrawer);
  const drawerOpen = useCartStore((s) => Boolean(s.drawer));
  const line = useCartStore((s) => (s.added ? s.summary?.items.find((i) => i.inventory_id === s.added!.inventoryId) ?? null : null));

  React.useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [added, setAdded]);

  if (!added || !line || drawerOpen) return null;
  return (
    <div role="status" aria-live="polite" className="absolute right-0 top-full z-40 mt-3 w-[340px] rounded-2xl border border-line bg-card p-4 shadow-float motion-safe:animate-pop">
      <span aria-hidden className="absolute -top-[7px] right-4 h-3.5 w-3.5 rotate-45 border-l border-t border-line bg-card" />
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-brand-700"><CheckCircle2 className="h-5 w-5" aria-hidden /> Added to Cart</p>
        <button type="button" onClick={() => setAdded(null)} aria-label="Close" className="tap -mr-1 flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      <div className="mt-3 flex gap-3">
        <ProductImage image={line.image_url} brand={line.brand_name} productName={line.name} packSize={line.pack_label} className="h-20 w-20 shrink-0" sizes="80px" rounded="rounded-lg" />
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{line.name}</p>
          <p className="mt-0.5 text-xs text-ink-3">{[line.pack_label, `×${line.quantity}`].filter(Boolean).join(" ")}</p>
          <p className="mt-2 inline-flex rounded-md bg-brand-600 px-2 py-0.5 text-sm font-bold text-white">{formatINR(line.unit_price)}</p>
        </div>
      </div>
      <Button variant="outline" fullWidth className="mt-4 rounded-xl" onClick={() => { setAdded(null); openDrawer("cart"); }}>Go to Cart <ChevronRight className="h-4 w-4" aria-hidden /></Button>
    </div>
  );
}
