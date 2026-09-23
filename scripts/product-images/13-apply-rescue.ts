/**
 * Applies the card-size QA verdict: swaps in the approved replacement photo for products whose live
 * image was judged amateur, and drops the photo entirely where no candidate reached catalogue quality
 * (a neutral "photo coming soon" tile beats a blurry fridge snap). Run 3-process + 4-publish after.
 */
import path from "node:path";

import { WORK, readJson, writeJson } from "./lib";
import type { Pick } from "./3-process";
import type { QCandidate } from "./7-improve";

type Final = { slug: string; variant: "framed" | "cutout"; pick: Pick; notes?: string; size_match?: string; confidence?: number };

async function main() {
  const approved = readJson<Record<string, number>>(path.join(WORK, "rescue-approved.json"), {});
  const dropped = readJson<string[]>(path.join(WORK, "rescue-dropped.json"), []);
  const pool = readJson<Record<string, QCandidate[]>>(path.join(WORK, "quality-candidates.json"), {});
  const picks = readJson<Pick[]>(path.join(WORK, "picks.json"), []);
  const finals = readJson<Final[]>(path.join(WORK, "final.json"), []);

  for (const [slug, n] of Object.entries(approved)) {
    const c = (pool[slug] ?? [])[n - 1];
    if (!c) { console.log(`${slug}: candidate #${n} not found`); continue; }
    const next: Pick = { slug, source: "off", code: c.code, imgid: c.imgid, angle: c.angle, crop: c.crop, product_name: c.product_name, quantity: c.quantity, size_match: c.size_match, kind: "packaging" };
    const pi = picks.findIndex((p) => p.slug === slug);
    if (pi >= 0) picks[pi] = next; else picks.push(next);
    const fi = finals.findIndex((f) => f.slug === slug);
    const fin: Final = { slug, variant: "framed", pick: next, size_match: c.size_match, notes: `replaced after card-size QA (was judged amateur); candidate #${n}, ${c.w}×${c.h}` };
    if (fi >= 0) finals[fi] = fin; else finals.push(fin);
    console.log(`${slug}: → ${c.code}/${c.imgid} (${c.w}×${c.h}, ${c.quantity ?? "?"} ${c.size_match})`);
  }

  const drop = new Set(dropped);
  const keptFinals = finals.filter((f) => !drop.has(f.slug));
  const keptPicks = picks.filter((p) => !drop.has(p.slug));
  // The published file itself is swept by 4-publish, which deletes anything the catalogue no longer
  // points at — filenames are content-hashed, so dropping the final.json entry is what removes it.
  for (const slug of drop) console.log(`${slug}: photo dropped (no candidate reached catalogue quality)`);
  // drop them from the published manifest too, so /attributions only credits images we actually ship
  const MANIFEST = path.resolve("public/products/manifest.json");
  const manifest = readJson<Record<string, unknown>>(MANIFEST, {});
  for (const slug of drop) delete manifest[slug];
  writeJson(MANIFEST, manifest);

  writeJson(path.join(WORK, "picks.json"), keptPicks);
  writeJson(path.join(WORK, "final.json"), keptFinals);
  console.log(`\n${Object.keys(approved).length} replaced · ${drop.size} dropped · ${keptFinals.length} products keep a photo`);
}
main().catch((e) => { console.error(e); process.exit(1); });
