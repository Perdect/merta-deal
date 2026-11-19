"use client";
import * as React from "react";
import { useCartStore } from "@/stores/cart-store";
import { CartButton } from "@/components/shop/cart-button";
import { AddedToCart } from "@/components/shop/added-to-cart";
import type { CartSummary } from "@/types/app";

const LINE = { id: "l1", inventory_id: "inv-1", product_id: "p1", name: "Shyam Filtered Groundnut Oil", slug: "shyam-filtered-groundnut-oil", image_url: null, pack_label: "15 kg tin", brand_name: "Shyam", quantity: 1, unit_price: 3199, unit_mrp: 3250, line_total: 3199, stock_qty: 20, max_order_qty: 5, available: true };

export function Preview() {
  React.useEffect(() => {
    useCartStore.setState({ summary: { items: [LINE], item_count: 1 } as unknown as CartSummary, added: { inventoryId: "inv-1", at: 0 } });
    // Keep it on screen for inspection: re-arm after the card's own timer clears it.
    const t = setInterval(() => useCartStore.setState({ added: { inventoryId: "inv-1", at: 0 } }), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="min-h-dvh bg-surface">
      <div className="border-b border-line bg-card"><div className="mx-auto flex max-w-6xl items-center justify-end px-6 py-2.5"><div className="relative"><CartButton className="h-11 w-11 bg-brand-600 text-white" /><AddedToCart /></div></div></div>
    </div>
  );
}
