import "server-only";
import { parseOrderText, type ParsedLine } from "@/lib/order-parser";
import type { AssistantSource } from "./schemas";
import { itemsToLines, proposeShoppingList } from "./assistant";

export type ParseOrderResult = { lines: ParsedLine[]; source: AssistantSource; model: string | null; fallback_reason: string | null };

/**
 * Parses dictated Hinglish/English order text into lines. Claude when configured, else the rule parser.
 * Shared by /api/ai/parse-order (voice ordering) and the WhatsApp webhook.
 */
export async function parseOrder(text: string): Promise<ParseOrderResult> {
  const result = await proposeShoppingList({ message: text, mode: "order" });
  if (result.source === "claude") return { lines: itemsToLines(result.items), source: "claude", model: result.model, fallback_reason: null };
  return { lines: parseOrderText(text), source: "rules", model: null, fallback_reason: result.fallback_reason };
}
