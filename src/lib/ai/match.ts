import "server-only";
import { searchProducts } from "@/lib/data/catalog";
import { suggestedPacks } from "@/lib/order-parser";
import type { ProductCard } from "@/types/app";
import type { MatchCandidate, MatchedLine, ShoppingItem } from "./schemas";

const CANDIDATES_PER_LINE = 3;
const CONCURRENCY = 4;

function toCandidate(p: ProductCard, item: ShoppingItem): MatchCandidate {
  return {
    id: p.id, name: p.name, slug: p.slug, pack_label: p.pack_label, weight_value: p.weight_value, weight_unit: p.weight_unit, image_url: p.image_url, category_slug: p.category_slug,
    brand_name: p.brand_name, is_veg: p.is_veg, inventory_id: p.inventory_id, store_id: p.store_id, store_name: p.store_name, store_slug: p.store_slug,
    selling_price: p.selling_price, mrp: p.mrp, stock_qty: p.stock_qty, stock_status: p.stock_status, max_order_qty: p.max_order_qty, discount_pct: p.discount_pct,
    suggested_packs: Math.min(p.max_order_qty ?? 99, suggestedPacks({ raw: item.query, query: item.query, quantity: item.quantity, unit: item.unit }, p.weight_value, p.weight_unit)),
  };
}

/** Matches each list line to up to 3 in-stock products via the synonym-aware search_products RPC. */
export async function matchItems(items: ShoppingItem[]): Promise<MatchedLine[]> {
  const out: MatchedLine[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      const item = items[i];
      const res = await searchProducts({ q: item.query, pageSize: CANDIDATES_PER_LINE, inStock: true, sort: "relevance" });
      out[i] = { item, candidates: res.items.filter((p) => p.inventory_id).map((p) => toCandidate(p, item)) };
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}
