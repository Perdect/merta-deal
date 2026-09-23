/**
 * Builds one contact sheet per problem product: the currently published photo followed by the best
 * re-sourced candidates, all framed exactly as a product card renders them. A judge then picks the
 * first tile that reaches catalogue quality, or answers "none" so the photo is removed instead.
 * Usage: tsx 12-rescue-sheet.ts [--slugs a,b] [--top 6]
 */
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { WORK, readJson, writeJson } from "./lib";
import type { QCandidate } from "./7-improve";

const PUB = path.resolve("public/products");
const CELL = 210, LAB = 24, COLS = 7;

/** One card-sized tile: trimmed, centred on the card surface, with a numbered caption bar. */
async function tile(file: string, caption: string, tone: string) {
  let body: Buffer;
  try {
    const trimmed = await sharp(file, { failOn: "none" }).rotate().trim({ threshold: 12 }).toBuffer();
    body = await sharp(trimmed).resize({ width: CELL - 12, height: CELL - LAB - 12, fit: "contain", background: "#F8F8F6" }).png().toBuffer();
  } catch {
    body = await sharp(file, { failOn: "none" }).resize({ width: CELL - 12, height: CELL - LAB - 12, fit: "contain", background: "#F8F8F6" }).png().toBuffer();
  }
  const label = Buffer.from(`<svg width="${CELL}" height="${LAB}"><rect width="100%" height="100%" fill="${tone}"/><text x="5" y="17" font-family="Helvetica, Arial" font-size="12" font-weight="700" fill="#fff">${caption}</text></svg>`);
  return sharp({ create: { width: CELL, height: CELL, channels: 4, background: "#F8F8F6" } })
    .composite([{ input: label, left: 0, top: 0 }, { input: body, left: 6, top: LAB + 6 }]).png().toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const top = Number(arg("--top") ?? 6);
  const slugs: string[] = arg("--slugs")?.split(",") ?? readJson<string[]>(path.join(WORK, "bad-slugs.json"), []);
  const pool = readJson<Record<string, QCandidate[]>>(path.join(WORK, "quality-candidates.json"), {});
  const out: { slug: string; sheet: string; options: { n: number; preview: string; code: string; imgid: string; product_name: string; quantity: string | null; size_match: string; w: number; h: number }[] }[] = [];

  for (const slug of slugs) {
    const cands = (pool[slug] ?? []).slice(0, top);
    if (!cands.length) { console.log(`${slug}: no candidates`); continue; }
    const tiles: Buffer[] = [];
    const options: (typeof out)[number]["options"] = [];
    const current = path.join(PUB, `${slug}.webp`);
    if (existsSync(current)) tiles.push(await tile(current, "CURRENT (live now)", "#B3261E"));
    for (const [i, c] of cands.entries()) {
      if (!existsSync(c.preview)) continue;
      tiles.push(await tile(c.preview, `#${i + 1} ${c.quantity ?? "?"} ${c.size_match === "exact" ? "=" : c.size_match === "different" ? "≠" : ""}`, "#0B6E4F"));
      options.push({ n: i + 1, preview: c.preview, code: c.code, imgid: c.imgid, product_name: c.product_name, quantity: c.quantity, size_match: c.size_match, w: c.w, h: c.h });
    }
    if (options.length === 0) { console.log(`${slug}: previews missing`); continue; }
    const cols = Math.min(COLS, tiles.length), rows = Math.ceil(tiles.length / cols);
    const sheet = path.join(WORK, "rescue", `${slug}.jpg`);
    mkdirSync(path.dirname(sheet), { recursive: true });
    await sharp({ create: { width: cols * CELL, height: rows * CELL, channels: 3, background: "#ffffff" } })
      .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * CELL, top: Math.floor(i / cols) * CELL })))
      .jpeg({ quality: 88 }).toFile(sheet);
    out.push({ slug, sheet, options });
    console.log(`${slug}: ${options.length} options → ${sheet}`);
  }
  writeJson(path.join(WORK, "rescue.json"), out);
  console.log(`\n${out.length} rescue sheets`);
}
main().catch((e) => { console.error(e); process.exit(1); });
