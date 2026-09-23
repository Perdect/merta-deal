/**
 * Quality audit of published product photos.
 * Flags: low source resolution, blurry originals (Laplacian variance), extreme aspect ratio (cropped strips),
 * and low subject coverage after trimming (product too small / too zoomed in the frame).
 * Output: WORK/audit.json + a printed table sorted worst-first.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { WORK, readJson, writeJson } from "./lib";
import type { Pick } from "./3-process";

type Processed = Record<string, { framed: string | null; cutout: string | null; original: string | null }>;
export type AuditRow = { slug: string; kind: string; srcW: number; srcH: number; megapixels: number; sharpness: number; aspect: number; coverage: number; verdict: "good" | "weak" | "bad"; reasons: string[] };

/** Variance of the Laplacian on a normalised grayscale copy — standard blur metric. */
async function sharpness(file: string) {
  const g = await sharp(file, { failOn: "none", limitInputPixels: 1e9 }).rotate().greyscale().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).normalise().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = g;
  const W = info.width, H = info.height;
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const lap = -4 * data[i] + data[i - 1] + data[i + 1] + data[i - W] + data[i + W];
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** How much of the framed canvas the product actually occupies (after trimming flat borders). */
async function coverage(framed: string) {
  const meta = await sharp(framed).metadata();
  const total = (meta.width ?? 1) * (meta.height ?? 1);
  try {
    const t = await sharp(framed).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
    return ((t.info.width * t.info.height) / total);
  } catch { return 1; }
}

async function main() {
  const picks = readJson<Pick[]>(path.join(WORK, "picks.json"), []);
  const processed = readJson<Processed>(path.join(WORK, "processed.json"), {});
  const rows: AuditRow[] = [];
  for (const p of picks) {
    const proc = processed[p.slug]; if (!proc?.original || !existsSync(proc.original)) continue;
    const meta = await sharp(proc.original, { failOn: "none", limitInputPixels: 1e9 }).metadata();
    const srcW = meta.width ?? 0, srcH = meta.height ?? 0;
    const mp = (srcW * srcH) / 1e6;
    const sh = await sharpness(proc.original);
    const aspect = srcW && srcH ? Math.max(srcW / srcH, srcH / srcW) : 99;
    const cov = proc.framed && existsSync(proc.framed) ? await coverage(proc.framed) : 0;
    const reasons: string[] = [];
    if (mp < 0.25) reasons.push(`low-res ${srcW}x${srcH}`);
    if (sh < 120) reasons.push(`blurry (lap ${Math.round(sh)})`);
    if (aspect > 2.4) reasons.push(`strip crop ${aspect.toFixed(1)}:1`);
    if (cov < 0.30) reasons.push(`subject fills ${Math.round(cov * 100)}%`);
    const verdict: AuditRow["verdict"] = reasons.some((r) => r.startsWith("blurry") || r.startsWith("low-res") || r.startsWith("strip")) ? "bad" : reasons.length ? "weak" : "good";
    rows.push({ slug: p.slug, kind: p.kind, srcW, srcH, megapixels: Number(mp.toFixed(2)), sharpness: Math.round(sh), aspect: Number(aspect.toFixed(2)), coverage: Number(cov.toFixed(2)), verdict, reasons });
  }
  rows.sort((a, b) => (a.verdict === b.verdict ? a.sharpness - b.sharpness : a.verdict === "bad" ? -1 : b.verdict === "bad" ? 1 : a.verdict === "weak" ? -1 : 1));
  writeJson(path.join(WORK, "audit.json"), rows);
  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
  for (const r of rows.filter((x) => x.verdict !== "good")) console.log(`${r.verdict.toUpperCase().padEnd(4)} ${r.slug.padEnd(42)} ${String(r.srcW)}x${r.srcH} lap=${r.sharpness} cov=${r.coverage} :: ${r.reasons.join(", ")}`);
  console.log(`\n${JSON.stringify(counts)} of ${rows.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
