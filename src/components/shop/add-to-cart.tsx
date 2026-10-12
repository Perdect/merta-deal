"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addToCartAction, getCartSummary } from "@/lib/actions/cart";
import { ensureGuestSessionAction } from "@/lib/actions/guest";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/overlay";
import { QuantityStepper } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

type Props = { inventoryId: string | null; maxQty?: number | null; stockQty?: number | null; size?: "sm" | "md"; className?: string; stepperClassName?: string; label?: string; signedIn?: boolean; fullWidth?: boolean };

/** ADD button that turns into a quantity stepper; syncs with the server cart via RPC. */
/** `className` styles the ADD button; `stepperClassName` styles the quantity control that replaces it. */
export function AddToCart({ inventoryId, maxQty, stockQty, size = "md", className, stepperClassName, label = "ADD", signedIn = true, fullWidth }: Props) {
  const router = useRouter();
  const qty = useCartStore((s) => (inventoryId ? s.qtyFor(inventoryId) : 0));
  const setPending = useCartStore((s) => s.setPending);
  const setSummary = useCartStore((s) => s.setSummary);
  const [busy, setBusy] = React.useState(false);
  const [conflict, setConflict] = React.useState<{ current: string; next: string; qty: number } | null>(null);
  const outOfStock = !inventoryId || (stockQty != null && stockQty <= 0);
  const max = Math.max(1, Math.min(maxQty ?? 10, stockQty ?? 99));

  const update = React.useCallback(async (next: number, replace = false) => {
    if (!inventoryId) return;
    if (!signedIn) {
      setBusy(true);
      const g = await ensureGuestSessionAction();
      if (!g.ok) { setBusy(false); router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
      if (g.created) router.refresh();
    }
    setPending(inventoryId, next); setBusy(true);
    const res = await addToCartAction(inventoryId, next, replace);
    if (!res.ok) {
      setPending(inventoryId, null);
      if (res.conflict) setConflict({ current: res.conflict.current_store.name, next: res.conflict.new_store.name, qty: next });
      else toast.error(res.error);
    } else {
      const summary = await getCartSummary();
      setSummary(summary); setPending(inventoryId, null);
      if (qty === 0 && next > 0) { toast.success("Added to cart"); track("add_to_cart", { items: [{ item_id: inventoryId, quantity: next }] }); }
    }
    setBusy(false);
  }, [inventoryId, signedIn, router, setPending, setSummary, qty]);

  if (outOfStock) {
    return <span className={cn("inline-flex items-center justify-center rounded-sm border border-line-2 bg-surface-2 px-3 text-xs font-semibold text-ink-3", size === "sm" ? "h-8" : "h-9", fullWidth && "w-full", className)}>Out of stock</span>;
  }

  return (
    <>
      {qty > 0 ? (
        <QuantityStepper value={qty} onChange={(v) => update(v)} min={0} max={max} size={size} loading={busy} className={cn("motion-safe:animate-pop", fullWidth && "w-full justify-between", stepperClassName)} />
      ) : (
        <button type="button" onClick={() => update(1)} disabled={busy}
          className={cn("tap inline-flex items-center justify-center gap-1 rounded-sm border border-brand-600 bg-brand-50 font-bold text-brand-700 transition-[background-color,transform] duration-150 hover:bg-brand-100 active:scale-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600", size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm", fullWidth && "w-full", className)}>
          {label}<Plus className="h-3.5 w-3.5" />
        </button>
      )}
      <ConfirmDialog open={Boolean(conflict)} onClose={() => setConflict(null)} title="Replace cart items?"
        description={conflict ? `Your cart has items from ${conflict.current}. Each order is delivered from one store, so adding this item will replace them with items from ${conflict.next}.` : null}
        confirmLabel="Replace cart" onConfirm={() => { const c = conflict; setConflict(null); if (c) update(c.qty, true); }} />
    </>
  );
}
