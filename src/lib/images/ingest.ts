import "server-only";
import sharp from "sharp";

/**
 * Normalises any supplied product photo (brand asset, supplier pack shot, or a photo taken in the shop)
 * into the catalogue's house style: trimmed of flat borders, centred on a 1000×1000 white canvas with
 * 8% padding, saved as WebP. next/image then serves AVIF/WebP at the size each card needs.
 */
export const CANVAS = 1000;
export const PAD = 0.08;

export type IngestResult = { webp: Buffer; width: number; height: number; bytes: number; sourceWidth: number; sourceHeight: number };

/**
 * Catalogue rule: every product photo is a transparent cutout. Background removal runs locally
 * (ISNet via @imgly/background-removal-node, a heavy optional dependency). When it is unavailable
 * in the runtime (e.g. a serverless deploy), the photo is kept framed and `cutout: false` is reported
 * so the admin knows to run `scripts/product-images` for it.
 */
export async function removeBackgroundIfAvailable(png: Buffer): Promise<Buffer | null> {
  try {
    const mod = await import("@imgly/background-removal-node");
    const out = await mod.removeBackground(new Blob([new Uint8Array(png)], { type: "image/png" }), { model: "medium", output: { format: "image/png", quality: 0.9 } });
    const cut = Buffer.from(await out.arrayBuffer());
    const stats = await sharp(cut).ensureAlpha().extractChannel(3).stats();
    const mean = stats.channels[0].mean / 255;
    if (mean < 0.04 || mean > 0.97) return null; // removed everything or nothing — keep the framed photo
    return cut;
  } catch { return null; }
}

export async function ingestProductImage(input: Buffer, opts: { trim?: boolean; background?: string; cutout?: boolean } = {}): Promise<IngestResult & { cutout: boolean }> {
  const src = sharp(input, { failOn: "none", limitInputPixels: 2e8 }).rotate();
  const meta = await src.metadata();
  if (!meta.width || !meta.height) throw new Error("Unreadable image");
  if (meta.width < 300 || meta.height < 300) throw new Error(`Image is too small (${meta.width}×${meta.height}); use at least 600×600`);

  let body: Buffer = await src.toBuffer();
  let cutout = false;
  if (opts.cutout !== false) {
    const cut = await removeBackgroundIfAvailable(await sharp(body).png().toBuffer());
    if (cut) { body = cut; cutout = true; opts = { ...opts, background: "transparent" }; }
  }
  if (opts.trim !== false) {
    try { body = await sharp(body).trim({ threshold: 12 }).toBuffer(); } catch { /* keep untrimmed */ }
  }
  const inner = CANVAS - Math.round(CANVAS * PAD) * 2;
  const fitted = await sharp(body).resize({ width: inner, height: inner, fit: "inside", withoutEnlargement: false }).png().toBuffer();
  const fm = await sharp(fitted).metadata();
  const webp = await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: opts.background === "transparent" ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: fitted, left: Math.round((CANVAS - (fm.width ?? 0)) / 2), top: Math.round((CANVAS - (fm.height ?? 0)) / 2) }])
    .webp({ quality: 86 })
    .toBuffer();
  return { webp, width: CANVAS, height: CANVAS, bytes: webp.length, sourceWidth: meta.width, sourceHeight: meta.height, cutout };
}

/** Downloads a supplied image URL with guards: https only, no private hosts, size and type limits. */
export async function fetchImage(url: string, maxBytes = 15 * 1024 * 1024): Promise<Buffer> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("Only https image URLs are accepted");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/i.test(u.hostname)) throw new Error("That host is not allowed");
  const r = await fetch(u, { headers: { "User-Agent": "MertaDeal-Catalog/1.0", Accept: "image/*" }, redirect: "follow", signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  const type = r.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png|webp|avif)/.test(type)) throw new Error(`That URL is not an image (${type || "unknown type"})`);
  const len = Number(r.headers.get("content-length") ?? 0);
  if (len && len > maxBytes) throw new Error("Image is larger than 15 MB");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("Image is larger than 15 MB");
  return buf;
}
