/**
 * Stage 3: turn verified picks into consistent e-commerce assets in public/products/<slug>.webp
 *  - full-resolution original from the S3 mirror (OFF) or the Commons file URL
 *  - rotation/crop as selected on Open Food Facts
 *  - "cutout" variant: local background removal (ISNet via @imgly/background-removal-node), trimmed, centred
 *    on a transparent canvas with 8% padding → the card's neutral surface shows through
 *  - "framed" variant: original photo, trimmed of flat borders, centred on white
 * Both variants are written to WORK/processed/<slug>.{cutout,framed}.webp for the visual QA stage; the chosen
 * variant is later copied to public/products/. Nothing here alters packaging content.
 */
import path from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import sharp from "sharp";
import { removeBackground } from "@imgly/background-removal-node";
import { WORK, S3, splitCode, download, readJson, writeJson } from "./lib";

export type Pick = { slug: string; source: "off" | "obf" | "opf" | "commons" | "supplied" | "retail"; code?: string; imgid?: string; angle?: number; crop?: { x1: number; y1: number; x2: number; y2: number } | null; file_url?: string; title?: string; retailer?: string; page_url?: string; license?: string; artist?: string; credit?: string; product_name?: string; quantity?: string | null; size_match?: string; kind: "packaging" | "commodity" };
const OUT = path.join(WORK, "processed");
const SIZE = 1000;

async function fetchOriginal(p: Pick): Promise<string | null> {
  if (p.source === "commons" && p.file_url) {
    const dest = path.join(WORK, "orig", `${p.slug}.commons${path.extname(p.file_url).toLowerCase() || ".jpg"}`);
    // Commons originals can be huge; request a 1600px thumbnail rendition instead (same licence, smaller download)
    const m = p.file_url.match(/\/wikipedia\/commons\/(.)\/(..)\/(.+)$/);
    const url = m ? `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/1600px-${m[3]}${/\.(png|webp)$/i.test(m[3]) ? "" : ""}` : p.file_url;
    if (await download(url, dest)) return dest;
    return (await download(p.file_url, dest)) ? dest : null;
  }
  if (p.code && p.imgid) {
    const dest = path.join(WORK, "orig", `${p.slug}.${p.code}-${p.imgid}.jpg`);
    return (await download(`${S3}/${splitCode(p.code)}/${p.imgid}.jpg`, dest)) ? dest : null;
  }
  return null;
}

async function prepared(p: Pick, src: string): Promise<Buffer> {
  let img = sharp(src, { failOn: "none", limitInputPixels: 1e9 }).rotate();
  if (p.angle) img = img.rotate(Number(p.angle));
  let buf = await img.toBuffer();
  if (p.crop) {
    const m = await sharp(buf).metadata(); const W = m.width ?? 0, H = m.height ?? 0;
    const x1 = Math.max(0, Math.round(p.crop.x1)), y1 = Math.max(0, Math.round(p.crop.y1)), x2 = Math.min(W, Math.round(p.crop.x2)), y2 = Math.min(H, Math.round(p.crop.y2));
    if (x2 - x1 > 40 && y2 - y1 > 40) buf = await sharp(buf).extract({ left: x1, top: y1, width: x2 - x1, height: y2 - y1 }).toBuffer();
  }
  // cap working size for speed/quality balance
  return sharp(buf).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
}

async function placeOnCanvas(buf: Buffer, bg: { r: number; g: number; b: number; alpha: number }) {
  const pad = Math.round(SIZE * 0.08);
  const inner = await sharp(buf).trim({ threshold: 12 }).toBuffer().catch(() => buf);
  const fitted = await sharp(inner).resize({ width: SIZE - pad * 2, height: SIZE - pad * 2, fit: "inside", withoutEnlargement: false }).png().toBuffer();
  const m = await sharp(fitted).metadata();
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: bg } })
    .composite([{ input: fitted, left: Math.round((SIZE - (m.width ?? 0)) / 2), top: Math.round((SIZE - (m.height ?? 0)) / 2) }]);
}

async function cutout(buf: Buffer): Promise<Buffer | null> {
  try {
    const blob = new Blob([new Uint8Array(buf)], { type: "image/png" });
    const out = await removeBackground(blob, { model: "medium", output: { format: "image/png", quality: 0.9 } });
    const png = Buffer.from(await out.arrayBuffer());
    // sanity: reject if almost everything was removed or almost nothing
    const stats = await sharp(png).ensureAlpha().extractChannel(3).stats();
    const mean = stats.channels[0].mean / 255;
    if (mean < 0.06 || mean > 0.97) return null;
    return png;
  } catch (e) { console.warn("  cutout failed:", (e as Error).message.slice(0, 120)); return null; }
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
  const picks = readJson<Pick[]>(path.join(WORK, "picks.json"), []).filter((p) => (only ? only.has(p.slug) : true));
  mkdirSync(OUT, { recursive: true });
  const results: Record<string, { framed: string | null; cutout: string | null; original: string | null }> = readJson(path.join(WORK, "processed.json"), {});
  for (const p of picks) {
    if (!only && results[p.slug]?.framed && (results[p.slug].cutout || p.kind === "commodity")) continue;
    const orig = await fetchOriginal(p);
    if (!orig) { console.log(`${p.slug}: original download FAILED`); results[p.slug] = { framed: null, cutout: null, original: null }; continue; }
    const base = await prepared(p, orig);
    const framedPath = path.join(OUT, `${p.slug}.framed.webp`);
    await (await placeOnCanvas(base, { r: 255, g: 255, b: 255, alpha: 1 })).webp({ quality: 84 }).toFile(framedPath);
    let cutoutPath: string | null = null;
    if (p.kind === "packaging" || /-(loose|jar|bag)/.test(p.slug) || true) {
      const c = await cutout(base);
      if (c) { cutoutPath = path.join(OUT, `${p.slug}.cutout.webp`); await (await placeOnCanvas(c, { r: 0, g: 0, b: 0, alpha: 0 })).webp({ quality: 84 }).toFile(cutoutPath); }
    }
    // keep the variants, drop the multi-MB original (re-downloadable from the source at any time)
    try { if (!process.env.KEEP_ORIGINALS) rmSync(orig, { force: true }); } catch { /* ignore */ }
    results[p.slug] = { framed: framedPath, cutout: cutoutPath, original: orig };
    writeJson(path.join(WORK, "processed.json"), results);
    console.log(`${p.slug}: framed ✓ cutout ${cutoutPath ? "✓" : "✗"}`);
  }
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
