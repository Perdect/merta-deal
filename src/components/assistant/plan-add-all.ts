import type { MatchCandidate } from "@/lib/ai/schemas";
import type { AssistantLine } from "@/lib/ai/assistant-types";
import type { LineChoice } from "./match-row";

/** Can this product be added now, by the stock the catalogue holds? */
export function canBuy(c: MatchCandidate | undefined): c is MatchCandidate {
  return Boolean(c?.inventory_id) && c!.stock_status !== "out_of_stock" && (c!.stock_qty == null || c!.stock_qty > 0);
}

export type AddPlan = {
  adds: { lineIdx: number; candidateIdx: number; inventoryId: string; packs: number; name: string; price: number }[];
  /** Ticked rows that cannot be added (the product went out of stock, or has no listing). */
  skipped: { lineIdx: number; name: string; reason: string }[];
};

/** What "Add selected" will do: only the rows the customer has ticked, with the product and packs they chose. */
export function planAddSelected(lines: AssistantLine[], choices: LineChoice[]): AddPlan {
  const plan: AddPlan = { adds: [], skipped: [] };
  lines.forEach((l, i) => {
    const choice = choices[i];
    if (!choice?.selected) return;
    const chosenIdx = l.candidates[choice.candidate] ? choice.candidate : 0;
    const chosen = l.candidates[chosenIdx];
    if (!chosen) return;
    if (!canBuy(chosen) || !chosen.inventory_id) { plan.skipped.push({ lineIdx: i, name: chosen.name, reason: "out of stock" }); return; }
    plan.adds.push({ lineIdx: i, candidateIdx: chosenIdx, inventoryId: chosen.inventory_id, packs: Math.max(1, choice.packs), name: chosen.name, price: Number(chosen.selling_price ?? chosen.mrp ?? 0) });
  });
  return plan;
}

/**
 * The starting choice for each row: the first product offered and its suggested packs. With `preselect`
 * the rows that can be bought now start ticked (the customer still has to tap Add); without it none do.
 */
export function initialChoices(lines: AssistantLine[], preselect: boolean): LineChoice[] {
  return lines.map((l) => ({ candidate: 0, packs: l.candidates[0]?.suggested_packs ?? 1, selected: preselect && canBuy(l.candidates[0]) }));
}
