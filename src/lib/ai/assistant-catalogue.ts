import "server-only";
import { searchProducts } from "@/lib/data/catalog";
import { suggestedPacks } from "@/lib/order-parser";
import type { ProductCard } from "@/types/app";
import type { MatchCandidate, ShoppingItem } from "./schemas";
import type { AssistantLine } from "./assistant-types";

/**
 * The catalogue as the assistant sees it, and the step that turns a proposed list into real product rows.
 *
 * With the AI on, the model is shown the listed products (name, pack, brand, category; no prices, no
 * stock) under short codes and answers with codes. A code is only ever looked up in this index, so a row
 * on the page is always a product the shop lists, with the price and stock the catalogue holds now.
 * Reads go through `searchProducts`, the same cached public read the shop pages use.
 */
export type CatalogueIndex = {
  byCode: Map<string, ProductCard>;
  /** False when the shop lists more products than the model is shown; unmatched items are then searched for. */
  complete: boolean;
  /** One product per line, for the model: `P1 | name | pack | brand | category`. */
  text: string;
};

const PAGE_SIZE = 60;
const MAX_PAGES = 5;
const CANDIDATES_PER_LINE = 3;
const CONCURRENCY = 4;

const cell = (v: string | null | undefined) => (v ?? "").replace(/[|\n\r]+/g, " ").trim() || "-";

/** Null when the catalogue cannot be read; the assistant then works without it and every item is searched for. */
export async function getCatalogueIndex(): Promise<CatalogueIndex | null> {
  const products: ProductCard[] = [];
  let complete = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await searchProducts({ sort: "popular", page, pageSize: PAGE_SIZE });
    if (res.error) return null;
    products.push(...res.items.filter((p) => p.inventory_id));
    if (!res.has_more) { complete = true; break; }
  }
  if (!products.length) return null;
  const byCode = new Map<string, ProductCard>();
  const lines: string[] = [];
  products.forEach((p, i) => {
    const code = `P${i + 1}`;
    byCode.set(code, p);
    lines.push(`${code} | ${cell(p.name)} | ${cell(p.pack_label)} | ${cell(p.brand_name)} | ${cell(p.category_name)}`);
  });
  return { byCode, complete, text: lines.join("\n") };
}

const inStock = (p: Pick<ProductCard, "stock_qty" | "stock_status" | "inventory_id">) => Boolean(p.inventory_id) && p.stock_status !== "out_of_stock" && (p.stock_qty == null || p.stock_qty > 0);

export function toCandidate(p: ProductCard, item: ShoppingItem): MatchCandidate {
  const wanted = suggestedPacks({ raw: item.query, query: item.query, quantity: item.quantity, unit: item.unit }, p.weight_value, p.weight_unit);
  const cap = Math.min(p.max_order_qty && p.max_order_qty > 0 ? p.max_order_qty : 99, p.stock_qty != null && p.stock_qty > 0 ? p.stock_qty : 99);
  return {
    id: p.id, name: p.name, slug: p.slug, pack_label: p.pack_label, weight_value: p.weight_value, weight_unit: p.weight_unit, image_url: p.image_url, category_slug: p.category_slug,
    brand_name: p.brand_name, is_veg: p.is_veg, inventory_id: p.inventory_id,
    selling_price: p.selling_price, mrp: p.mrp, stock_qty: p.stock_qty, stock_status: p.stock_status, max_order_qty: p.max_order_qty, discount_pct: p.discount_pct,
    suggested_packs: Math.max(1, Math.min(cap, wanted)),
  };
}

/** A product that can be bought now comes before one that is out of stock; otherwise the order given is kept. */
function availableFirst(products: ProductCard[]): ProductCard[] {
  return [...products.filter(inStock), ...products.filter((p) => !inStock(p))];
}

export type PlannedItem = ShoppingItem & { /** Catalogue codes the model chose for this item, best first. Empty when it chose none. */ codes: string[] };

/**
 * Turns each proposed item into catalogue rows, out-of-stock products included (they are shown as such).
 * An item the model matched keeps its picks. An item it did not match is searched for with the shop's own
 * search, except when the model was shown the whole catalogue and found nothing: then it is reported as
 * not in the shop, rather than offering whatever a loose text search happens to return.
 */
export async function matchPlannedItems(items: PlannedItem[], index: CatalogueIndex | null, opts: { modelSawCatalogue: boolean }): Promise<AssistantLine[]> {
  const out: AssistantLine[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      const { codes, ...item } = items[i];
      const seen = new Set<string>();
      const picked = codes.map((c) => index?.byCode.get(c)).filter((p): p is ProductCard => Boolean(p && !seen.has(p.id) && seen.add(p.id))).slice(0, CANDIDATES_PER_LINE);
      if (picked.length || (opts.modelSawCatalogue && index?.complete)) {
        out[i] = { item, candidates: availableFirst(picked).map((p) => toCandidate(p, item)) };
        continue;
      }
      const res = await searchProducts({ q: item.query, pageSize: CANDIDATES_PER_LINE, inStock: false, sort: "relevance" });
      out[i] = { item, candidates: availableFirst(res.items.filter((p) => p.inventory_id)).map((p) => toCandidate(p, item)), ...(res.error ? { lookup_failed: true } : {}) };
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}
