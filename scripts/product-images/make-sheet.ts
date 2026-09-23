/**
 * Builds a contact sheet (JPEG) of a product's candidates so a vision reviewer can compare them in one image.
 * Usage: tsx make-sheet.ts <slug> [--commons] → WORK/sheets/<slug>.jpg ; prints the sheet path and the candidate legend.
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { WORK, readJson } from "./lib";

async function main() {
  const [slug, flag] = process.argv.slice(2);
  const file = flag === "--commons" ? "commons.json" : "candidates.json";
  const entry = readJson<Record<string, { candidates: { preview: string | null; [k: string]: unknown }[] }>>(path.join(WORK, file), {})[slug];
  if (!entry) { console.log("NO ENTRY"); return; }
  const cands = entry.candidates.filter((c) => c.preview).slice(0, 6);
  const CELL = 360, LABEL = 28, cols = Math.min(3, Math.max(1, cands.length)), rows = Math.ceil(cands.length / cols) || 1;
  const tiles = await Promise.all(cands.map(async (c, i) => {
    const img = await sharp(c.preview as string).resize({ width: CELL, height: CELL - LABEL, fit: "contain", background: "#ffffff" }).png().toBuffer();
    const label = Buffer.from(`<svg width="${CELL}" height="${LABEL}"><rect width="100%" height="100%" fill="#0B6E4F"/><text x="8" y="19" font-family="Helvetica, Arial" font-size="15" font-weight="700" fill="#fff">#${i + 1}</text></svg>`);
    return sharp({ create: { width: CELL, height: CELL, channels: 4, background: "#ffffff" } }).composite([{ input: label, left: 0, top: 0 }, { input: img, left: 0, top: LABEL }]).png().toBuffer();
  }));
  const out = path.join(WORK, "sheets", `${slug}${flag === "--commons" ? ".commons" : ""}.jpg`);
  mkdirSync(path.dirname(out), { recursive: true });
  await sharp({ create: { width: cols * CELL, height: rows * CELL, channels: 3, background: "#e6e6e1" } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * CELL, top: Math.floor(i / cols) * CELL })))
    .jpeg({ quality: 80 }).toFile(out);
  console.log(out);
}
main().catch((e) => { console.error(e); process.exit(1); });
