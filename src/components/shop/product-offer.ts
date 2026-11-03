import type { ProductDetail, ProductOffer } from "@/types/app";

export type Offer = Pick<ProductOffer, "inventory_id" | "selling_price" | "mrp" | "stock_qty" | "status" | "max_order_qty" | "discount_pct">;

/** The product's listing as the customer buys it (price, stock and per-order limit). */
export function resolveOffer(product: ProductDetail): Offer | null {
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
