/** Contact sheet of quality-scored candidates (OFF or Commons) with score labels. Usage: tsx 9-sheet.ts <slug> [--commons] */
import path from "node:path";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { WORK, readJson } from "./lib";

type C = { preview: string; score: number; w: number; h: number; sharpness: number; quantity?: string | null; product_name?: string; title?: string };
async function main() {
  const [slug, flag] = process.argv.slice(2);
  const file = flag === "--commons" ? "quality-commons.json" : "quality-candidates.json";
  const cands = (readJson<Record<string, C[]>>(path.join(WORK, file), {})[slug] ?? []).slice(0, 9);
  if (!cands.length) { console.log("NONE"); return; }
  const CELL = 340, LAB = 30, cols = Math.min(3, cands.length), rows = Math.ceil(cands.length / cols);
  const tiles = await Promise.all(cands.map(async (c, i) => {
    const img = await sharp(c.preview).resize({ width: CELL, height: CELL - LAB, fit: "contain", background: "#ffffff" }).png().toBuffer();
    const txt = `#${i + 1}  score ${c.score}  ${c.w}x${c.h}  lap ${c.sharpness}`;
    const label = Buffer.from(`<svg width="${CELL}" height="${LAB}"><rect width="100%" height="100%" fill="#0B6E4F"/><text x="7" y="20" font-family="Helvetica, Arial" font-size="13" font-weight="700" fill="#fff">${txt}</text></svg>`);
    return sharp({ create: { width: CELL, height: CELL, channels: 4, background: "#ffffff" } }).composite([{ input: label, left: 0, top: 0 }, { input: img, left: 0, top: LAB }]).png().toBuffer();
  }));
  const out = path.join(WORK, "qsheets", `${slug}${flag === "--commons" ? ".commons" : ""}.jpg`);
  mkdirSync(path.dirname(out), { recursive: true });
  await sharp({ create: { width: cols * CELL, height: rows * CELL, channels: 3, background: "#e6e6e1" } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * CELL, top: Math.floor(i / cols) * CELL })))
    .jpeg({ quality: 82 }).toFile(out);
  console.log(out);
}
main().catch((e) => { console.error(e); process.exit(1); });
