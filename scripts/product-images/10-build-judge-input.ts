/** Builds per-product JSON + contact sheets for the vision judge from the quality-scored candidate pools. */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { WORK, readJson, writeJson, loadCatalog, catalogQuantity } from "./lib";
import type { QCandidate } from "./7-improve";
import type { CommonsQCandidate } from "./8-improve-commons";

async function main() {
  const off = readJson<Record<string, QCandidate[]>>(path.join(WORK, "quality-candidates.json"), {});
  const com = readJson<Record<string, CommonsQCandidate[]>>(path.join(WORK, "quality-commons.json"), {});
  const catalog = new Map((await loadCatalog()).map((c) => [c.slug, c]));
  const dir = path.join(WORK, "judge"); mkdirSync(dir, { recursive: true });
  const index: { slug: string; kind: string; n: number }[] = [];
  const emit = (slug: string, kind: "packaging" | "commodity", cands: (QCandidate | CommonsQCandidate)[], commons: boolean) => {
    if (!cands.length) return;
    const row = catalog.get(slug); if (!row) return;
    const q = catalogQuantity(row);
    const sheet = execFileSync("pnpm", ["exec", "tsx", "scripts/product-images/9-sheet.ts", slug, ...(commons ? ["--commons"] : [])], { encoding: "utf8" }).trim().split("\n").pop();
    const item = {
      slug, kind, sheet,
      spec: { brand: row.brand, name: row.name, pack: row.pack_label, amount: `${q.amount} ${q.unit}`, category: row.category },
      candidates: cands.slice(0, 9).map((c, i) => commons
        ? { n: i + 1, title: (c as CommonsQCandidate).title, license: (c as CommonsQCandidate).license, score: c.score, px: `${c.w}x${c.h}`, sharpness: c.sharpness, preview: c.preview }
        : { n: i + 1, listed_name: (c as QCandidate).product_name, listed_quantity: (c as QCandidate).quantity, size_hint: (c as QCandidate).size_match, marked_front: (c as QCandidate).isFront, score: c.score, px: `${c.w}x${c.h}`, sharpness: c.sharpness, preview: c.preview, source_url: (c as QCandidate).source_url }),
    };
    writeJson(path.join(dir, `${slug}.json`), item);
    index.push({ slug, kind, n: Math.min(9, cands.length) });
  };
  for (const [slug, cands] of Object.entries(off)) emit(slug, "packaging", cands, false);
  for (const [slug, cands] of Object.entries(com)) if (!off[slug]?.length) emit(slug, "commodity", cands, true);
  writeJson(path.join(WORK, "judge-index.json"), index);
  console.log(`judge items: ${index.length} (packaging ${index.filter((i) => i.kind === "packaging").length}, commodity ${index.filter((i) => i.kind === "commodity").length})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
