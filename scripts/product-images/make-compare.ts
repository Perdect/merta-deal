/** Side-by-side of cutout (on the card's neutral surface) vs framed variant for QA. Usage: tsx make-compare.ts <slug> → prints path */
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import sharp, { type OverlayOptions } from "sharp";
import { WORK } from "./lib";
(async () => {
  const slug = process.argv[2]; const dir = path.join(WORK, "processed");
  const cut = path.join(dir, `${slug}.cutout.webp`), fr = path.join(dir, `${slug}.framed.webp`);
  if (!existsSync(fr)) { console.log("NONE"); return; }
  const b = await sharp(fr).resize(420).jpeg().toBuffer();
  const label = (t: string) => Buffer.from(`<svg width="420" height="28"><rect width="100%" height="100%" fill="#0B6E4F"/><text x="8" y="19" font-family="Helvetica, Arial" font-size="15" font-weight="700" fill="#fff">${t}</text></svg>`);
  const parts: OverlayOptions[] = [{ input: label("B: framed (original photo)"), left: 440, top: 0 }, { input: b, left: 440, top: 28 }];
  if (existsSync(cut)) { const a = await sharp(cut).flatten({ background: "#F3F3EF" }).resize(420).jpeg().toBuffer(); parts.unshift({ input: label("A: cutout (background removed)"), left: 0, top: 0 }, { input: a, left: 0, top: 28 }); }
  const out = path.join(WORK, "compare", `${slug}.jpg`); mkdirSync(path.dirname(out), { recursive: true });
  await sharp({ create: { width: 860, height: 448, channels: 3, background: "#ffffff" } }).composite(parts).jpeg({ quality: 80 }).toFile(out);
  console.log(out + (existsSync(cut) ? "" : " (framed only)"));
})();
