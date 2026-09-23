"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Store as StoreIcon, Zap, Truck, Check } from "lucide-react";
import type { ProductDetail, ProductOffer } from "@/types/app";
import { addToCartAction, getCartSummary } from "@/lib/actions/cart";
import { ensureGuestSessionAction } from "@/lib/actions/guest";
import { useCartStore } from "@/stores/cart-store";
import { useLocationStore } from "@/stores/location-store";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Price, QuantityStepper } from "@/components/ui/misc";
import { DiscountBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";

/** Store/offer selector + ADD TO CART + BUY NOW for the product page. */
export function ProductPurchase({ product, signedIn }: { product: ProductDetail; signedIn: boolean }) {
  const router = useRouter();
  const offers = product.offers.filter((o) => o.status !== "out_of_stock");
  const [offer, setOffer] = React.useState<ProductOffer | null>(offers[0] ?? product.offers[0] ?? null);
  const qty = useCartStore((s) => (offer ? s.qtyFor(offer.inventory_id) : 0));
  const setPending = useCartStore((s) => s.setPending);
  const setSummary = useCartStore((s) => s.setSummary);
  const location = useLocationStore((s) => s.location);
  const [busy, setBusy] = React.useState<"add" | "buy" | null>(null);
  const [conflict, setConflict] = React.useState<{ current: string; next: string; mode: "add" | "buy" } | null>(null);
  const hydrated = useHydrated();

  const run = async (mode: "add" | "buy", replace = false) => {
    if (!offer) return;
    if (!signedIn) {
      setBusy(mode);
      const g = await ensureGuestSessionAction();
      if (!g.ok) { setBusy(null); router.push(`/login?next=${encodeURIComponent(`/p/${product.slug}`)}`); return; }
      if (g.created) router.refresh();
    }
    setBusy(mode);
    const target = mode === "buy" ? Math.max(1, qty) : qty + 1;
    setPending(offer.inventory_id, target);
    const res = await addToCartAction(offer.inventory_id, target, replace);
    if (!res.ok) {
      setPending(offer.inventory_id, null);
      if (res.conflict) setConflict({ current: res.conflict.current_store.name, next: res.conflict.new_store.name, mode });
      else toast.error(res.error);
      setBusy(null); return;
    }
    setSummary(await getCartSummary()); setPending(offer.inventory_id, null);
    setBusy(null);
    if (mode === "buy") router.push("/checkout"); else toast.success("Added to cart");
  };

  const setQty = async (v: number) => {
    if (!offer) return;
    setPending(offer.inventory_id, v);
    const res = await addToCartAction(offer.inventory_id, v);
    if (!res.ok) { setPending(offer.inventory_id, null); toast.error(res.error); return; }
    setSummary(await getCartSummary()); setPending(offer.inventory_id, null);
  };

  const soldOut = !offer || offer.status === "out_of_stock";
  const eta = hydrated && location?.etaMax ? `${location.etaMin}–${location.etaMax} min` : "30–60 min";

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-end gap-3">
          <Price price={offer?.selling_price ?? product.base_mrp} mrp={offer?.mrp ?? product.base_mrp} size="lg" />
          {offer ? <DiscountBadge pct={offer.discount_pct} className="mb-1.5" /> : null}
        </div>
        <p className="mt-1 text-xs text-ink-3">Inclusive of all taxes · {product.pack_label}</p>
      </div>

      {product.offers.length ? (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">Available at {product.offers.length} store{product.offers.length > 1 ? "s" : ""}</p>
          <ul className="space-y-2">
            {product.offers.map((o) => {
              const active = offer?.inventory_id === o.inventory_id; const out = o.status === "out_of_stock";
              return (
                <li key={o.inventory_id}>
                  <button type="button" disabled={out} onClick={() => setOffer(o)} className={cn("flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors", active ? "border-brand-600 bg-brand-50" : "border-line bg-card hover:bg-surface", out && "opacity-50")}>
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-sm", active ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-3")}>{active ? <Check className="h-5 w-5" /> : <StoreIcon className="h-4.5 w-4.5" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{o.store_name}</span>
                      <span className="block text-xs text-ink-3">{o.store_area} · {o.is_open ? `${o.avg_prep_minutes} min prep` : "Closed now"}{o.status === "low_stock" ? ` · Only ${o.stock_qty} left` : ""}{out ? " · Out of stock" : ""}</span>
                    </span>
                    <Price price={o.selling_price} mrp={o.mrp} size="sm" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : <p className="rounded-md bg-surface-2 p-3 text-sm text-ink-3">Not available from any store right now.</p>}

      <div className="grid grid-cols-2 gap-2 rounded-md border border-line bg-surface p-3 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><Truck className="h-4 w-4 text-brand-600" />Delivery in {eta}</span>
        <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-saffron-600" />Express where supported</span>
      </div>

      <div className="flex gap-2 sm:max-w-md">
        {qty > 0 ? (
          <div className="flex flex-1 items-center justify-between rounded-sm border border-brand-600 bg-brand-50 px-3"><span className="text-sm font-semibold text-brand-700">In cart</span><QuantityStepper value={qty} onChange={setQty} min={0} max={offer ? Math.min(offer.max_order_qty, offer.stock_qty) : 10} /></div>
        ) : (
          <Button size="lg" variant="secondary" className="flex-1" disabled={soldOut} loading={busy === "add"} onClick={() => run("add")}>ADD TO CART</Button>
        )}
        <Button size="lg" className="flex-1" disabled={soldOut} loading={busy === "buy"} onClick={() => run("buy")}>BUY NOW</Button>
      </div>

      <ConfirmDialog open={Boolean(conflict)} onClose={() => setConflict(null)} title="Replace cart items?" confirmLabel="Replace cart"
        description={conflict ? `Your cart has items from ${conflict.current}. Orders are delivered from one store at a time, so we'll replace them with items from ${conflict.next}.` : null}
        onConfirm={() => { const c = conflict; setConflict(null); if (c) run(c.mode, true); }} />
    </div>
  );
}
