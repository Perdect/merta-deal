import { Sparkles, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AssistantSource } from "@/lib/ai/schemas";

/** Honest provenance label: Claude vs the deterministic parser. */
export function SourceBadge({ source, model, fallbackReason }: { source: AssistantSource; model?: string | null; fallbackReason?: string | null }) {
  if (source === "claude") return <Badge tone="brand" size="xs" title={model ?? undefined}><Sparkles className="h-3 w-3" />AI (Claude)</Badge>;
  return <Badge tone="neutral" size="xs" title={fallbackReason ?? "ANTHROPIC_API_KEY is not set"}><ListChecks className="h-3 w-3" />{fallbackReason ? `Rule-based (${fallbackReason})` : "Rule-based (AI key not configured)"}</Badge>;
}
