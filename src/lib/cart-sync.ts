"use client";
import { addToCartAction, getCartSummary } from "@/lib/actions/cart";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "@/components/ui/toast";
import { maxPerOrderMessage, onlyAvailableMessage } from "@/lib/utils";

type StoreRef = { id: string; name: string };
export type SetQtyResult = { ok: true; quantity: number } | { ok: false; error: string; conflict?: { current_store: StoreRef; new_store: StoreRef } };

/** Other tabs listen on this channel and reload the cart after any change here. */
export const CART_CHANNEL = "md-cart";
function announce() { try { const c = new BroadcastChannel(CART_CHANNEL); c.postMessage("changed"); c.close(); } catch { /* not supported */ } }

/** Fallback when a product row carries no limit (the DB default is the `default_max_order_qty` setting). */
export const DEFAULT_MAX_PER_ORDER = 5;

/** The most packs a customer may pick and why: the per-product limit, or less stock than that. */
export function packLimit(maxQty?: number | null, stockQty?: number | null) {
  const limit = maxQty && maxQty > 0 ? maxQty : DEFAULT_MAX_PER_ORDER;
  const stock = stockQty ?? Number.POSITIVE_INFINITY;
  const byStock = stock < limit;
  return { max: Math.max(0, Math.min(limit, stock)), byStock, message: byStock ? onlyAvailableMessage(stock) : maxPerOrderMessage(limit) };
}

const lines = new Map<string, { desired: number; replace: boolean; run: Promise<SetQtyResult> }>();

/**
 * Sets one cart line to `qty` packs (0 removes it). The screen updates at once; the server gets one
 * request at a time per product, and taps made while a request is in flight are folded into the
 * next one, so rapid taps are neither lost nor duplicated. The server enforces the limits; after
 * every change (or failure) the cart is reloaded from the server, which restores correct values.
 */
export function setLineQuantity(inventoryId: string, qty: number, opts: { replace?: boolean; quiet?: boolean } = {}): Promise<SetQtyResult> {
  useCartStore.getState().setPending(inventoryId, qty);
  const existing = lines.get(inventoryId);
  if (existing) {
    existing.desired = qty;
    if (opts.replace) existing.replace = true;
    return existing.run;
  }
  const line = { desired: qty, replace: Boolean(opts.replace), run: null as unknown as Promise<SetQtyResult> };
  lines.set(inventoryId, line);
  line.run = (async (): Promise<SetQtyResult> => {
    let result: SetQtyResult;
    try {
      for (;;) {
        const target = line.desired;
        const replace = line.replace; line.replace = false;
        const res = await addToCartAction(inventoryId, target, replace);
        if (!res.ok) { result = { ok: false, error: res.error, conflict: res.conflict }; break; }
        if (line.desired !== target) continue;
        const summary = await getCartSummary();
        if (line.desired !== target) continue; // more taps arrived while refreshing
        lines.delete(inventoryId);
        const store = useCartStore.getState();
        if (summary) store.setSummary(summary);
        store.setPending(inventoryId, null);
        announce();
        return { ok: true, quantity: target };
      }
    } catch {
      result = { ok: false, error: "You seem to be offline. Check your internet connection and try again." };
    }
    // Failed: show the server's real quantity again.
    lines.delete(inventoryId);
    const summary = await getCartSummary().catch(() => null);
    const store = useCartStore.getState();
    if (summary) store.setSummary(summary);
    store.setPending(inventoryId, null);
    if (!result.conflict && !opts.quiet) toast.error(result.error);
    return result;
  })();
  return line.run;
}
