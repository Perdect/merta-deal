/**
 * Turns verified workflow decisions into WORK/picks.json (input of 3-process.ts) and WORK/final-map.json.
 * Usage: tsx apply-picks.ts <decisions.json>   where decisions = [{ slug, pick: n|null, size_match, confidence, notes }]
 */
import path from "node:path";
import { WORK, readJson, writeJson } from "./lib";
import type { Pick } from "./3-process";

type Decision = { slug: string; pick: number | null; size_match?: string; confidence?: number; notes?: string; variant?: string };
type Item = { slug: string; kind: "packaging" | "commodity"; candidates: Record<string, unknown>[] };
const decisions = readJson<Decision[]>(process.argv[2], []);
const items = new Map(readJson<Item[]>(path.join(WORK, "review-items.json"), []).map((i) => [i.slug, i]));
const off = readJson<Record<string, { candidates: { code: string; source: string; product_name: string; quantity: string | null; imgid: string | null; angle: number; size: string }[] }>>(path.join(WORK, "candidates.json"), {});
const commons = readJson<Record<string, { candidates: { title: string; page_url: string; file_url: string; license: string; artist: string; credit: string }[] }>>(path.join(WORK, "commons.json"), {});
const picks = readJson<Pick[]>(path.join(WORK, "picks.json"), []).filter((p) => !decisions.some((d) => d.slug === p.slug));
const finalMap = readJson<Record<string, Decision>>(path.join(WORK, "final-map.json"), {});
let added = 0;
for (const d of decisions) {
  const item = items.get(d.slug); if (!item || d.pick == null) continue;
  const idx = d.pick - 1;
  if (item.kind === "packaging") {
    const c = off[d.slug]?.candidates[idx]; if (!c) continue;
    picks.push({ slug: d.slug, source: c.source as Pick["source"], code: c.code, imgid: c.imgid ?? undefined, angle: c.angle, crop: null, product_name: c.product_name, quantity: c.quantity, size_match: d.size_match ?? c.size, kind: "packaging" });
  } else {
    const c = commons[d.slug]?.candidates[idx]; if (!c) continue;
    picks.push({ slug: d.slug, source: "commons", file_url: c.file_url, title: c.title, page_url: c.page_url, license: c.license, artist: c.artist, credit: c.credit, kind: "commodity" });
  }
  finalMap[d.slug] = d; added++;
}
writeJson(path.join(WORK, "picks.json"), picks);
writeJson(path.join(WORK, "final-map.json"), finalMap);
console.log(`picks: ${picks.length} (added ${added})`);
