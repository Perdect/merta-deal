/**
 * Shared helpers for the product-image pipeline (sourcing → verification → processing).
 * Sources: Open Food Facts / Open Beauty Facts / Open Products Facts (images CC BY-SA 3.0, contributors),
 * Wikimedia Commons (per-file licence, checked). Nothing is generated; every image is a real photo.
 */
import { Client } from "pg";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const UA = "MertaDeal-Catalog/0.1 (https://mertadeal.in; help@mertadeal.in)";
export const S3 = "https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data";
export const WORK = process.env.IMG_WORK_DIR ?? path.resolve(".image-pipeline"); // durable, gitignored working dir
export const DB_URL = process.env.DATABASE_URL ?? "postgresql://sameer@localhost:5432/merta_deal";

export type CatalogRow = { id: string; slug: string; name: string; brand: string | null; pack_label: string | null; weight_value: number; weight_unit: string; category: string; is_local: boolean };

export async function loadCatalog(): Promise<CatalogRow[]> {
  const c = new Client({ connectionString: DB_URL }); await c.connect();
  const r = await c.query(`select p.id, p.slug, p.name, b.name as brand, p.pack_label, p.weight_value::float as weight_value, p.weight_unit, c.slug as category, p.is_local
    from products p left join brands b on b.id = p.brand_id join categories c on c.id = p.category_id order by p.slug`);
  await c.end(); return r.rows;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson<T>(url: string, tries = 3): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await sleep(15000); continue; }
      if (!r.ok) { if (r.status === 404) return null; await sleep(2000 * (i + 1)); continue; }
      return (await r.json()) as T;
    } catch { await sleep(2000 * (i + 1)); }
  }
  return null;
}

export async function download(url: string, dest: string, tries = 3): Promise<boolean> {
  if (existsSync(dest)) return true;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
      if (r.status === 404) return false;
      if (!r.ok) { await sleep(1500 * (i + 1)); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 500) return false;
      mkdirSync(path.dirname(dest), { recursive: true }); writeFileSync(dest, buf); return true;
    } catch { await sleep(1500 * (i + 1)); }
  }
  return false;
}

export function readJson<T>(file: string, fallback: T): T { try { return JSON.parse(readFileSync(file, "utf8")) as T; } catch { return fallback; } }
export function writeJson(file: string, data: unknown) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(data, null, 2)); }

/** Parse "500 ml", "1kg", "8 x 70g (560g)", "Pack of 4", "10 slices", "1 L" into a comparable base amount. */
export function parseQuantity(q: string | null | undefined): { amount: number; unit: "g" | "ml" | "count"; raw: string } | null {
  if (!q) return null;
  const s = q.toLowerCase().replace(/,/g, ".").replace(/litre|liter|ltr/g, "l").replace(/grams?|gms?|gm/g, "g").replace(/kilo(gram)?s?|kgs/g, "kg").replace(/millilitres?|mls/g, "ml");
  const multi = s.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
  if (multi) { const n = Number(multi[1]); const v = Number(multi[2]); const u = multi[3]; return { amount: n * (u === "kg" ? v * 1000 : u === "l" ? v * 1000 : v), unit: u === "ml" || u === "l" ? "ml" : "g", raw: q }; }
  const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
  if (m) { const v = Number(m[1]); const u = m[2]; return { amount: u === "kg" || u === "l" ? v * 1000 : v, unit: u === "ml" || u === "l" ? "ml" : "g", raw: q }; }
  const cnt = s.match(/(?:pack of|x)\s*(\d+)|(\d+)\s*(?:pcs?|pieces?|slices|pants|wipes|pads|razors?|bags|units?|sachets?|bars?|soaps?)/);
  if (cnt) return { amount: Number(cnt[1] ?? cnt[2]), unit: "count", raw: q };
  return null;
}

export function catalogQuantity(row: CatalogRow) {
  const fromLabel = parseQuantity(row.pack_label);
  if (fromLabel) return fromLabel;
  const u = row.weight_unit;
  if (u === "kg" || u === "l") return { amount: row.weight_value * 1000, unit: (u === "l" ? "ml" : "g") as "g" | "ml", raw: `${row.weight_value} ${u}` };
  if (u === "g" || u === "ml") return { amount: row.weight_value, unit: u as "g" | "ml", raw: `${row.weight_value} ${u}` };
  return { amount: row.weight_value, unit: "count" as const, raw: `${row.weight_value} ${u}` };
}

export function sizeMatch(a: ReturnType<typeof parseQuantity>, b: ReturnType<typeof parseQuantity>): "exact" | "close" | "different" | "unknown" {
  if (!a || !b) return "unknown";
  if (a.unit !== b.unit) { if ((a.unit === "g" && b.unit === "ml") || (a.unit === "ml" && b.unit === "g")) { /* density ~1 for milk/water */ } else return "different"; }
  const ratio = a.amount / b.amount;
  if (Math.abs(ratio - 1) < 0.03) return "exact";
  if (Math.abs(ratio - 1) < 0.12) return "close";
  return "different";
}

export const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export function tokens(s: string | null | undefined) { return norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t)); }
const STOP = new Set(["the", "and", "of", "with", "pack", "pcs", "pc", "kg", "g", "ml", "l", "gm", "loose", "pasteurised", "pasteurized"]);

export function splitCode(code: string) {
  const c = code.padStart(13, "0");
  return c.length === 13 ? `${c.slice(0, 3)}/${c.slice(3, 6)}/${c.slice(6, 9)}/${c.slice(9)}` : code;
}

/** Rotate (and crop, when OFF stored crop coords) a raw OFF image so it matches the "front" selection. */
export async function normaliseOffImage(src: string, dest: string, meta: { angle?: number | null; x1?: number | null; y1?: number | null; x2?: number | null; y2?: number | null }, maxSide = 400) {
  let img = sharp(src, { failOn: "none" }).rotate(); // EXIF first
  const angle = Number(meta.angle ?? 0);
  if (angle) img = img.rotate(angle);
  const buf = await img.toBuffer();
  let out = sharp(buf);
  const m = await out.metadata();
  if (meta.x1 != null && meta.x2 != null && meta.y1 != null && meta.y2 != null && Number(meta.x2) > Number(meta.x1) && Number(meta.y2) > Number(meta.y1)) {
    // OFF crop coordinates are relative to the (rotated) full-size image
    const W = m.width ?? 0, H = m.height ?? 0;
    const x1 = Math.max(0, Math.round(Number(meta.x1))), y1 = Math.max(0, Math.round(Number(meta.y1)));
    const x2 = Math.min(W, Math.round(Number(meta.x2))), y2 = Math.min(H, Math.round(Number(meta.y2)));
    if (x2 - x1 > 20 && y2 - y1 > 20) out = out.extract({ left: x1, top: y1, width: x2 - x1, height: y2 - y1 });
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  await out.resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(dest);
}
