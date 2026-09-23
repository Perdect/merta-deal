import { z } from "zod";
import type { ProductCard } from "@/types/app";

/** Units the assistant may return. Mirrors the normalised units of src/lib/order-parser.ts. */
export const UNITS = ["kg", "g", "l", "ml", "pack", "pcs", "bottle", "dozen", "box", "jar", "bag"] as const;
export type Unit = (typeof UNITS)[number];

export const shoppingItemSchema = z.object({
  query: z.string().trim().min(1).max(80),
  quantity: z.number().positive().max(1000),
  unit: z.enum(UNITS).nullable(),
  note: z.string().trim().max(160).nullable(),
});
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

export const assistantRequestSchema = z.object({
  message: z.string().trim().min(2, "Kuch likhiye ya boliye").max(1200),
  mode: z.enum(["list", "order"]).default("list"),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

export const parseOrderRequestSchema = z.object({ text: z.string().trim().min(2).max(1200) });

export type AssistantSource = "claude" | "rules";

export type MatchCandidate = Pick<ProductCard, "id" | "name" | "slug" | "pack_label" | "weight_value" | "weight_unit" | "image_url" | "category_slug" | "brand_name" | "is_veg" | "inventory_id" | "store_id" | "store_name" | "store_slug" | "selling_price" | "mrp" | "stock_qty" | "stock_status" | "max_order_qty" | "discount_pct"> & {
  /** Packs suggested for this candidate given the requested quantity/unit (from suggestedPacks()). */
  suggested_packs: number;
};

export type MatchedLine = {
  item: ShoppingItem;
  candidates: MatchCandidate[];
};

export type AssistantResponse = {
  source: AssistantSource;
  model: string | null;
  /** Set when the AI key is configured but the call failed and we fell back to rules. */
  fallback_reason: string | null;
  reply: string;
  lines: MatchedLine[];
};
