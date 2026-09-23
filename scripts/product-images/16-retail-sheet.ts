/** Renders retail candidates as product-card tiles, one row per product, for visual QA. */
import path from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";
import { WORK, readJson, writeJson, loadCatalog } from "./lib";

const PUB = path.resolve("public/products");
const CELL = 210, LAB = 24;

async function tile(file: string, caption: string, tone: string) {
  let body: Buffer;
  const fit = { width: CELL - 12, height: CELL - LAB - 12, fit: "contain" as const, background: "#F8F8F6" };
  try { body = await sharp(file, { failOn: "none" }).rotate().flatten({ background: "#ffffff" }).trim({ threshold: 12 }).resize(fit).png().toBuffer(); }
  catch { body = await sharp(file, { failOn: "none" }).flatten({ background: "#ffffff" }).resize(fit).png().toBuffer(); }
  const label = Buffer.from(`<svg width="${CELL}" height="${LAB}"><rect width="100%" height="100%" fill="${tone}"/><text x="4" y="17" font-family="Helvetica, Arial" font-size="11" font-weight="700" fill="#fff">${caption.replace(/[<&>]/g, "")}</text></svg>`);
  return sharp({ create: { width: CELL, height: CELL, channels: 4, background: "#F8F8F6" } })
    .composite([{ input: label, left: 0, top: 0 }, { input: body, left: 6, top: LAB + 6 }]).png().toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const top = Number(arg("--top") ?? 6);
  const perSheet = Number(arg("--per-sheet") ?? 5);
  const pool = readJson<Record<string, { slug: string; preview: string; file: string; retailer: string; w: number; h: number; score: number; title: string; page: string; url: string }[]>>(path.join(WORK, "retail-candidates.json"), {});
  const only = arg("--slugs")?.split(",").map((s) => s.trim()).filter(Boolean);
  const slugs = (only ?? Object.keys(pool)).filter((s) => (pool[s] ?? []).length);

  const catalog = await loadCatalog();
  const index: { sheet: string; rows: { slug: string; name: string; brand: string | null; pack: string | null; options: { n: number; retailer: string; w: number; h: number; score: number; title: string; url: string; page: string; preview: string }[] }[] }[] = [];
  for (let s = 0; s < slugs.length; s += perSheet) {
    const group = slugs.slice(s, s + perSheet);
    const parts: { input: Buffer; left: number; top: number }[] = [];
    const rows: (typeof index)[number]["rows"] = [];
    let y = 0, width = 0;
    for (const slug of group) {
      const cands = (pool[slug] ?? []).slice(0, top);
      const tiles: Buffer[] = [];
      const options: (typeof rows)[number]["options"] = [];
      const live = path.join(PUB, `${slug}.webp`);
      if (existsSync(live)) tiles.push(await tile(live, "LIVE NOW", "#B3261E"));
      for (const [i, c] of cands.entries()) {
        if (!existsSync(c.preview)) continue;
        tiles.push(await tile(c.preview, `#${i + 1} ${c.retailer} ${c.w}x${c.h}`, "#0B6E4F"));
        options.push({ n: i + 1, retailer: c.retailer, w: c.w, h: c.h, score: c.score, title: c.title, url: c.url, page: c.page, preview: c.preview });
      }
      if (!options.length) continue;
      const banner = Buffer.from(`<svg width="${(tiles.length) * CELL}" height="22"><rect width="100%" height="100%" fill="#111"/><text x="5" y="16" font-family="Helvetica, Arial" font-size="13" font-weight="700" fill="#fff">${slug}</text></svg>`);
      parts.push({ input: banner, left: 0, top: y }); y += 22;
      tiles.forEach((t, i) => parts.push({ input: t, left: i * CELL, top: y })); y += CELL;
      width = Math.max(width, tiles.length * CELL);
      const row = catalog.find((r) => r.slug === slug);
      rows.push({ slug, name: row?.name ?? slug, brand: row?.brand ?? null, pack: row?.pack_label ?? null, options });
    }
    if (!rows.length) continue;
    const out = path.join(WORK, "retail-sheets", `sheet-${String(Math.floor(s / perSheet) + 1).padStart(2, "0")}.jpg`);
    mkdirSync(path.dirname(out), { recursive: true });
    await sharp({ create: { width, height: y, channels: 3, background: "#ffffff" } }).composite(parts).jpeg({ quality: 88 }).toFile(out);
    index.push({ sheet: out, rows });
    console.log(`${out} ← ${rows.map((r) => r.slug).join(", ")}`);
  }
  writeJson(path.join(WORK, "retail-sheets.json"), index);
  console.log(`\n${index.length} sheets covering ${index.reduce((a, s) => a + s.rows.length, 0)} products`);
}
main().catch((e) => { console.error(e); process.exit(1); });
