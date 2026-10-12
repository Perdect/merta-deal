import type { ProductDetail, ProductOffer } from "@/types/app";

export type Offer = Pick<ProductOffer, "inventory_id" | "selling_price" | "mrp" | "stock_qty" | "status" | "max_order_qty" | "discount_pct">;

/**
 * Picks the one offer a customer buys — they never choose a store.
 * 1. If the cart already belongs to a store that stocks this product, use that offer, so the
 *    one-store-per-order rule (carts.store_id) holds without a "replace cart" prompt.
 * 2. Otherwise the product's best offer, exactly as v_product_cards ranks it:
 *    in stock → store open → cheapest. No other store rule is invented here.
 */
export function resolveOffer(product: ProductDetail, cartStoreId: string | null): Offer | null {
  if (cartStoreId) {
    const atCartStore = product.offers.find((o) => o.store_id === cartStoreId && o.status !== "out_of_stock");
    if (atCartStore) return atCartStore;
  }
  if (product.inventory_id && product.selling_price != null) {
    return {
      inventory_id: product.inventory_id,
      selling_price: product.selling_price,
      mrp: product.mrp ?? product.base_mrp,
      stock_qty: product.stock_qty ?? 0,
      status: product.stock_status ?? "out_of_stock",
      max_order_qty: product.max_order_qty ?? 10,
      discount_pct: product.discount_pct ?? 0,
    };
  }
  return product.offers.find((o) => o.status !== "out_of_stock") ?? product.offers[0] ?? null;
}
