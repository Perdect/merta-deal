import { ListChecks, RotateCcw, Sparkles, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AssistantSource } from "@/lib/ai/schemas";

/**
 * Honest provenance label, one per kind of content the assistant shows:
 * `claude` = written or chosen by the AI model, `rules` = the built-in parser and starter lists,
 * `shop` = sentences written by code from the shop's settings and delivery zones,
 * `orders` = read from the signed-in customer's own delivered orders.
 */
export function SourceBadge({ source, model, fallbackReason }: { source: AssistantSource | "shop" | "orders"; model?: string | null; fallbackReason?: string | null }) {
  if (source === "claude") return <Badge tone="brand" size="xs" title={`Written by an AI model${model ? ` (${model})` : ""}. It can be wrong: check before you add anything.`}><Sparkles className="h-3 w-3" />AI-generated · Claude</Badge>;
  if (source === "shop") return <Badge tone="success" size="xs" title="Read from the shop's current settings and delivery zones. Not written by AI."><Store className="h-3 w-3" />From shop settings</Badge>;
  if (source === "orders") return <Badge tone="info" size="xs" title="Read from your own delivered orders. Not written by AI."><RotateCcw className="h-3 w-3" />From your past orders</Badge>;
  return <Badge tone="neutral" size="xs" title={fallbackReason ? `The AI could not answer (${fallbackReason}), so the built-in rules did.` : "ANTHROPIC_API_KEY is not set, so the built-in rules answered."}><ListChecks className="h-3 w-3" />{fallbackReason ? `Not AI · built-in rules (${fallbackReason})` : "Not AI · built-in rules (AI is not set up)"}</Badge>;
}
