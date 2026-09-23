import type { MatchedLine } from "@/lib/ai/schemas";
import type { LineChoice } from "./match-row";

export type AddPlan = {
  targetStoreId: string | null;
  targetStoreName: string | null;
  adds: { lineIdx: number; candidateIdx: number; inventoryId: string; packs: number; name: string; switched: boolean }[];
  skipped: { lineIdx: number; name: string; reason: string }[];
};

/**
 * Every Merta Deal order is fulfilled by ONE store, so "Add all" must pick a single store.
 * If the cart already has a store we keep it; otherwise we choose the store that can supply the most lines
 * (ties go to the first line's selected match). Lines the target store cannot supply are skipped with a note.
 */
export function planAddAll(lines: MatchedLine[], choices: LineChoice[], cartStoreId: string | null): AddPlan {
  const withMatch = lines.map((l, i) => ({ l, i, c: l.candidates[choices[i]?.candidate ?? 0] ?? l.candidates[0] })).filter((x) => x.c?.inventory_id);
  if (!withMatch.length) return { targetStoreId: null, targetStoreName: null, adds: [], skipped: lines.map((l, i) => ({ lineIdx: i, name: l.item.query, reason: "no in-stock match" })) };

  let targetStoreId = cartStoreId;
  if (!targetStoreId) {
    const coverage = new Map<string, number>();
    for (const { l } of withMatch) for (const sid of new Set(l.candidates.map((c) => c.store_id).filter((s): s is string => Boolean(s)))) coverage.set(sid, (coverage.get(sid) ?? 0) + 1);
    const first = withMatch[0]!.c!.store_id;
    let best = first; let bestN = first ? coverage.get(first) ?? 0 : 0;
    for (const [sid, n] of coverage) if (n > bestN) { best = sid; bestN = n; }
    targetStoreId = best ?? null;
  }
  const targetStoreName = lines.flatMap((l) => l.candidates).find((c) => c.store_id === targetStoreId)?.store_name ?? null;

  const plan: AddPlan = { targetStoreId, targetStoreName, adds: [], skipped: [] };
  lines.forEach((l, i) => {
    const chosenIdx = choices[i]?.candidate ?? 0;
    const chosen = l.candidates[chosenIdx];
    if (!l.candidates.length) { plan.skipped.push({ lineIdx: i, name: l.item.query, reason: "no in-stock match" }); return; }
    if (chosen?.inventory_id && chosen.store_id === targetStoreId) { plan.adds.push({ lineIdx: i, candidateIdx: chosenIdx, inventoryId: chosen.inventory_id, packs: choices[i]?.packs ?? chosen.suggested_packs, name: chosen.name, switched: false }); return; }
    const altIdx = l.candidates.findIndex((c) => c.inventory_id && c.store_id === targetStoreId);
    if (altIdx >= 0) { const alt = l.candidates[altIdx]!; plan.adds.push({ lineIdx: i, candidateIdx: altIdx, inventoryId: alt.inventory_id!, packs: alt.suggested_packs, name: alt.name, switched: true }); return; }
    plan.skipped.push({ lineIdx: i, name: chosen?.name ?? l.item.query, reason: targetStoreName ? `not available at ${targetStoreName}` : "different store" });
  });
  return plan;
}
