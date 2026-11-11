"use client";
import { addToCartAction, getCartSummary } from "@/lib/actions/cart";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "@/components/ui/toast";
import { maxPerOrderMessage, onlyAvailableMessage } from "@/lib/utils";

export type SetQtyResult = { ok: true; quantity: number } | { ok: false; error: string };

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

const lines = new Map<string, { desired: number; run: Promise<SetQtyResult> }>();

/**
 * Cake options for a line (0049): remembered for the next ADD, and sent at once when the line is already
 * in the cart (the server keeps the quantity). An empty message clears the message.
 */
export function setLineOptions(inventoryId: string, choice: { eggless: boolean; message: string }): Promise<SetQtyResult> | undefined {
  const store = useCartStore.getState();
  store.setDraft(inventoryId, choice);
  const qty = store.qtyFor(inventoryId);
  return qty > 0 ? setLineQuantity(inventoryId, qty) : undefined;
}

/**
 * Sets one cart line to `qty` packs (0 removes it). The screen updates at once; the server gets one
 * request at a time per product, and taps made while a request is in flight are folded into the
 * next one, so rapid taps are neither lost nor duplicated. The server enforces the limits; after
 * every change (or failure) the cart is reloaded from the server, which restores correct values.
 */
export function setLineQuantity(inventoryId: string, qty: number, opts: { quiet?: boolean } = {}): Promise<SetQtyResult> {
  useCartStore.getState().setPending(inventoryId, qty);
  const existing = lines.get(inventoryId);
  if (existing) {
    existing.desired = qty;
    return existing.run;
  }
  const line = { desired: qty, run: null as unknown as Promise<SetQtyResult> };
  lines.set(inventoryId, line);
  line.run = (async (): Promise<SetQtyResult> => {
    let result: SetQtyResult;
    try {
      for (;;) {
        const target = line.desired;
        const draft = useCartStore.getState().draft[inventoryId];
        const res = await addToCartAction(inventoryId, target, draft ? { eggless: draft.eggless, message: draft.message } : undefined);
        if (!res.ok) { result = { ok: false, error: res.error }; break; }
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
    if (!opts.quiet) toast.error(result.error);
    return result;
  })();
  return line.run;
}
