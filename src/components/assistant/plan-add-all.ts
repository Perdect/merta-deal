import type { MatchedLine } from "@/lib/ai/schemas";
import type { LineChoice } from "./match-row";

export type AddPlan = {
  adds: { lineIdx: number; candidateIdx: number; inventoryId: string; packs: number; name: string }[];
  skipped: { lineIdx: number; name: string; reason: string }[];
};

/** "Add all": every line with an in-stock match goes in with the chosen packs; the rest are reported. */
export function planAddAll(lines: MatchedLine[], choices: LineChoice[]): AddPlan {
  const plan: AddPlan = { adds: [], skipped: [] };
  lines.forEach((l, i) => {
    const chosenIdx = choices[i]?.candidate ?? 0;
    const chosen = l.candidates[chosenIdx] ?? l.candidates[0];
    if (!chosen?.inventory_id) { plan.skipped.push({ lineIdx: i, name: chosen?.name ?? l.item.query, reason: "no in-stock match" }); return; }
    plan.adds.push({ lineIdx: i, candidateIdx: chosenIdx, inventoryId: chosen.inventory_id, packs: choices[i]?.packs ?? chosen.suggested_packs, name: chosen.name });
  });
  return plan;
}
