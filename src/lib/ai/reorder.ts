import "server-only";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { getProductsByIds } from "@/lib/data/catalog";
import { friendlyError } from "@/lib/utils";
import type { AssistantLine } from "./assistant-types";
import { toCandidate } from "./assistant-catalogue";

/**
 * "Buy again": the products a signed-in customer has had delivered most often, with today's price and
 * stock. Read with the customer's own session, so row-level security returns their orders and nobody
 * else's; the same select the My orders page makes, with the product id added. Nothing here goes to the
 * AI: the list is counted by code and the rows are labelled as coming from past orders.
 */
export type ReorderOutcome =
  | { status: "signed_out" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ok"; lines: AssistantLine[]; orders: number };

const ORDERS_READ = 30;
const MAX_LINES = 12;

export async function getReorderSuggestions(): Promise<ReorderOutcome> {
  const user = await getAuthUser();
  // A guest session has no account behind it: suggestions from past orders are for signed-in customers.
  if (!user || user.is_anonymous) return { status: "signed_out" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders")
    .select("id, created_at, items:order_items(product_id, product_name, pack_label, quantity)")
    .eq("user_id", user.id).in("status", ["delivered", "completed"])
    .order("created_at", { ascending: false }).limit(ORDERS_READ);
  if (error) return { status: "error", message: friendlyError(error) };
  const orders = (data ?? []) as unknown as { id: string; created_at: string; items: { product_id: string; product_name: string; pack_label: string | null; quantity: number }[] | null }[];
  if (!orders.length) return { status: "empty" };

  // Newest order first, so the first time a product is met gives its latest name and quantity.
  const seen = new Map<string, { name: string; pack: string | null; lastQty: number; times: number; order: number }>();
  orders.forEach((o, orderIdx) => {
    const inThisOrder = new Set<string>();
    for (const it of o.items ?? []) {
      if (!it.product_id || inThisOrder.has(it.product_id)) continue;
      inThisOrder.add(it.product_id);
      const row = seen.get(it.product_id);
      if (row) row.times++;
      else seen.set(it.product_id, { name: it.product_name, pack: it.pack_label, lastQty: Number(it.quantity) || 1, times: 1, order: orderIdx });
    }
  });
  const ranked = [...seen.entries()].sort((a, b) => b[1].times - a[1].times || a[1].order - b[1].order).slice(0, MAX_LINES);
  if (!ranked.length) return { status: "empty" };

  const cards = await getProductsByIds(ranked.map(([id]) => id));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const lines: AssistantLine[] = ranked.map(([id, r]) => {
    const item = { query: r.pack ? `${r.name} (${r.pack})` : r.name, quantity: r.lastQty, unit: null, note: r.times > 1 ? `In ${r.times} of your delivered orders` : null };
    const card = byId.get(id);
    // `getProductsByIds` returns nothing both when the read fails and when every product is gone; with
    // no row at all back, the page says it could not check instead of "not in our shop".
    return { item, candidates: card?.inventory_id ? [toCandidate(card, item)] : [], ...(cards.length ? {} : { lookup_failed: true }) };
  });
  return { status: "ok", lines, orders: orders.length };
}
