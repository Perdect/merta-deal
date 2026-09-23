/** Renders published photos exactly as the customer sees them on a card (200px on the card surface), 12 per sheet, for final QA. */
import path from "node:path";
import { readdirSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { WORK, writeJson } from "./lib";

const PUB = path.resolve("public/products");
async function main() {
  const files = readdirSync(PUB).filter((f) => f.endsWith(".webp")).sort();
  const CELL = 210, LAB = 26, COLS = 4, PER = 12;
  const sheets: { sheet: string; slugs: string[] }[] = [];
  for (let s = 0; s < files.length; s += PER) {
    const group = files.slice(s, s + PER);
    const tiles = await Promise.all(group.map(async (f, i) => {
      const img = await sharp(path.join(PUB, f)).resize({ width: CELL, height: CELL - LAB, fit: "contain", background: "#F8F8F6" }).png().toBuffer();
      const label = Buffer.from(`<svg width="${CELL}" height="${LAB}"><rect width="100%" height="100%" fill="#0B6E4F"/><text x="5" y="18" font-family="Helvetica, Arial" font-size="12" font-weight="700" fill="#fff">#${i + 1} ${f.replace(".webp", "").slice(0, 26)}</text></svg>`);
      return sharp({ create: { width: CELL, height: CELL, channels: 4, background: "#F8F8F6" } }).composite([{ input: label, left: 0, top: 0 }, { input: img, left: 0, top: LAB }]).png().toBuffer();
    }));
    const rows = Math.ceil(tiles.length / COLS);
    const out = path.join(WORK, "cardqa", `sheet-${String(s / PER + 1).padStart(2, "0")}.jpg`);
    mkdirSync(path.dirname(out), { recursive: true });
    await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 3, background: "#ffffff" } })
      .composite(tiles.map((t, i) => ({ input: t, left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL })))
      .jpeg({ quality: 85 }).toFile(out);
    sheets.push({ sheet: out, slugs: group.map((f) => f.replace(".webp", "")) });
  }
  writeJson(path.join(WORK, "cardqa.json"), sheets);
  console.log(`${files.length} published images → ${sheets.length} card sheets`);
}
main().catch((e) => { console.error(e); process.exit(1); });
