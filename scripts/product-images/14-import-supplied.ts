/**
 * Imports a photo you supply — a brand/manufacturer pack shot, a distributor asset, or one you shot
 * yourself — into the catalogue's house style, then hands it to 4-publish like any other image.
 * This is the highest-quality source we have: open crowd-sourced photos rarely reach catalogue bar.
 *
 * Usage:
 *   tsx 14-import-supplied.ts --file pack.png --slugs a-slug,b-slug [--credit "ITC Ltd"] [--source-url https://…]
 *   tsx 14-import-supplied.ts --dir ./incoming            # every <slug>.{png,jpg,jpeg,webp} in a folder
 *
 * The framing matches 3-process.ts exactly (trim flat borders → 8% padding → centred on a 1000×1000
 * white canvas → WebP), so a supplied photo sits identically to a sourced one on the product card.
 */
import path from "node:path";
import { mkdirSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import sharp from "sharp";
import { WORK, readJson, writeJson } from "./lib";
import type { Pick } from "./3-process";

type Final = { slug: string; variant: "framed" | "cutout"; pick: Pick; notes?: string; size_match?: string; confidence?: number };

const OUT = path.join(WORK, "processed");
const SIZE = 1000;
const MIN_PX = 400;

/** Same canvas rules as 3-process.ts so every card matches, whatever the photo's origin. */
async function frameTo(src: string, dest: string) {
  const meta = await sharp(src, { failOn: "none" }).metadata();
  if (!meta.width || !meta.height) throw new Error("unreadable image");
  if (meta.width < MIN_PX || meta.height < MIN_PX) throw new Error(`too small (${meta.width}×${meta.height}); use at least ${MIN_PX}×${MIN_PX}`);
  const base = await sharp(src, { failOn: "none", limitInputPixels: 1e9 }).rotate().flatten({ background: "#ffffff" }).toBuffer();
  const pad = Math.round(SIZE * 0.08);
  const inner = await sharp(base).trim({ threshold: 12 }).toBuffer().catch(() => base);
  const fitted = await sharp(inner).resize({ width: SIZE - pad * 2, height: SIZE - pad * 2, fit: "inside", withoutEnlargement: false }).png().toBuffer();
  const fm = await sharp(fitted).metadata();
  mkdirSync(path.dirname(dest), { recursive: true });
  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: fitted, left: Math.round((SIZE - (fm.width ?? 0)) / 2), top: Math.round((SIZE - (fm.height ?? 0)) / 2) }])
    .webp({ quality: 88 }).toFile(dest);
  return { w: meta.width, h: meta.height };
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const credit = arg("--credit") ?? null;
  const sourceUrl = arg("--source-url") ?? null;
  const dir = arg("--dir");
  const file = arg("--file");
  const slugs = arg("--slugs")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  const jobs: { slug: string; src: string }[] = [];
  if (dir) {
    for (const f of readdirSync(dir)) {
      if (!/\.(png|jpe?g|webp|avif)$/i.test(f)) continue;
      jobs.push({ slug: f.replace(/\.[^.]+$/, ""), src: path.join(dir, f) });
    }
  } else if (file && slugs.length) {
    for (const slug of slugs) jobs.push({ slug, src: file });
  } else {
    console.error("usage: --file <img> --slugs a,b   |   --dir <folder of <slug>.png>");
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  mkdirSync(path.join(WORK, "supplied"), { recursive: true });
  const processed = readJson<Record<string, { framed: string | null; cutout: string | null; original: string | null }>>(path.join(WORK, "processed.json"), {});
  const picks = readJson<Pick[]>(path.join(WORK, "picks.json"), []);
  const finals = readJson<Final[]>(path.join(WORK, "final.json"), []);

  for (const job of jobs) {
    if (!existsSync(job.src)) { console.log(`${job.slug}: source missing`); continue; }
    // keep the supplied original inside the repo's work dir so a re-publish never needs the user's file again
    const keep = path.join(WORK, "supplied", `${job.slug}${path.extname(job.src).toLowerCase()}`);
    copyFileSync(job.src, keep);
    const framed = path.join(OUT, `${job.slug}.framed.webp`);
    let dims;
    try { dims = await frameTo(keep, framed); } catch (e) { console.log(`${job.slug}: ${(e as Error).message}`); continue; }

    const pick: Pick = { slug: job.slug, source: "supplied", kind: "packaging", credit: credit ?? undefined, page_url: sourceUrl ?? undefined, license: credit ? `Pack shot supplied by the retailer (${credit})` : undefined };
    const pi = picks.findIndex((p) => p.slug === job.slug);
    if (pi >= 0) picks[pi] = pick; else picks.push(pick);
    processed[job.slug] = { framed, cutout: null, original: keep };
    const fin: Final = { slug: job.slug, variant: "framed", pick, size_match: "exact", confidence: 1, notes: `supplied pack shot (${dims.w}×${dims.h})` };
    const fi = finals.findIndex((f) => f.slug === job.slug);
    if (fi >= 0) finals[fi] = fin; else finals.push(fin);
    console.log(`${job.slug}: framed ✓ from supplied ${dims.w}×${dims.h}`);
  }

  writeJson(path.join(WORK, "processed.json"), processed);
  writeJson(path.join(WORK, "picks.json"), picks);
  writeJson(path.join(WORK, "final.json"), finals);
  console.log(`\n${jobs.length} supplied image(s) staged — run 4-publish.ts to publish`);
}
main().catch((e) => { console.error(e); process.exit(1); });
