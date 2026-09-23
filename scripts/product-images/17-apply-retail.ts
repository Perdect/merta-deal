/**
 * Stages approved retail-sourced pack shots for publishing. Input: WORK/retail-approved.json,
 * a { "<slug>": <candidate number> } map written after the visual QA pass; a slug mapped to 0
 * means "none of the candidates is good enough" and any live photo for it is dropped.
 * Framing matches 3-process.ts exactly, so these sit identically to every other card.
 */
import path from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";
import { WORK, readJson, writeJson } from "./lib";
import type { Pick } from "./3-process";

type Final = { slug: string; variant: "framed" | "cutout"; pick: Pick; notes?: string; size_match?: string; confidence?: number };
type Cand = { slug: string; url: string; page: string; retailer: string; title: string; w: number; h: number; file: string; score: number };

const OUT = path.join(WORK, "processed");
const SIZE = 1000;

/** Trim flat borders → 8% padding → centred on a 1000×1000 white canvas → WebP. */
async function frameTo(src: string, dest: string) {
  const base = await sharp(src, { failOn: "none", limitInputPixels: 1e9 }).rotate().flatten({ background: "#ffffff" }).toBuffer();
  const pad = Math.round(SIZE * 0.08);
  const inner = await sharp(base).trim({ threshold: 12 }).toBuffer().catch(() => base);
  const fitted = await sharp(inner).resize({ width: SIZE - pad * 2, height: SIZE - pad * 2, fit: "inside", withoutEnlargement: false }).png().toBuffer();
  const fm = await sharp(fitted).metadata();
  mkdirSync(path.dirname(dest), { recursive: true });
  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: fitted, left: Math.round((SIZE - (fm.width ?? 0)) / 2), top: Math.round((SIZE - (fm.height ?? 0)) / 2) }])
    .webp({ quality: 88 }).toFile(dest);
}

async function main() {
  const approved = readJson<Record<string, number>>(path.join(WORK, "retail-approved.json"), {});
  const pool = readJson<Record<string, Cand[]>>(path.join(WORK, "retail-candidates.json"), {});
  const processed = readJson<Record<string, { framed: string | null; cutout: string | null; original: string | null }>>(path.join(WORK, "processed.json"), {});
  const picks = readJson<Pick[]>(path.join(WORK, "picks.json"), []);
  let finals = readJson<Final[]>(path.join(WORK, "final.json"), []);

  // A photo the retailer supplied themselves always outranks one sourced off a listing: they chose it,
  // and it is the only source whose rights are unambiguous. Sourcing never overwrites one.
  const suppliedSlugs = new Set(finals.filter((f) => f.pick.source === "supplied").map((f) => f.slug));

  let staged = 0, dropped = 0, keptSupplied = 0;
  for (const [slug, n] of Object.entries(approved)) {
    if (suppliedSlugs.has(slug)) { keptSupplied++; console.log(`${slug}: keeping the supplied pack shot`); continue; }
    if (!n) {
      // dropping the final.json entry is enough: 4-publish sweeps every file the catalogue no longer points at
      finals = finals.filter((f) => f.slug !== slug);
      dropped++;
      continue;
    }
    const c = (pool[slug] ?? [])[n - 1];
    if (!c || !existsSync(c.file)) { console.log(`${slug}: candidate #${n} unavailable`); continue; }
    const framed = path.join(OUT, `${slug}.framed.webp`);
    try { await frameTo(c.file, framed); } catch (e) { console.log(`${slug}: ${(e as Error).message}`); continue; }
    const pick: Pick = { slug, source: "retail", kind: "packaging", retailer: c.retailer, page_url: c.page || undefined, credit: c.retailer, file_url: c.url, title: c.title };
    const pi = picks.findIndex((p) => p.slug === slug); if (pi >= 0) picks[pi] = pick; else picks.push(pick);
    processed[slug] = { framed, cutout: null, original: c.file };
    const fin: Final = { slug, variant: "framed", pick, size_match: "exact", confidence: 1, notes: `${c.retailer} listing pack shot (${c.w}×${c.h}), approved at card size` };
    const fi = finals.findIndex((f) => f.slug === slug); if (fi >= 0) finals[fi] = fin; else finals.push(fin);
    staged++;
    console.log(`${slug}: ${c.retailer} #${n} ${c.w}×${c.h} ✓`);
  }
  writeJson(path.join(WORK, "processed.json"), processed);
  writeJson(path.join(WORK, "picks.json"), picks);
  writeJson(path.join(WORK, "final.json"), finals);
  console.log(`\n${staged} staged · ${dropped} dropped · ${keptSupplied} supplied photo(s) left untouched · run 4-publish.ts`);
}
main().catch((e) => { console.error(e); process.exit(1); });
