import { readFileSync } from "node:fs";
import path from "node:path";

/** Server-side reader for public/products/manifest.json (image source + licence per product slug). */
export type ProductImageRecord = { file: string; variant: "framed" | "cutout"; kind: "packaging" | "commodity"; source: string; source_url: string | null; license: string; license_url?: string; attribution: string; barcode: string | null; matched_name: string | null; matched_quantity: string | null; size_match: string | null; confidence: number | null; notes: string | null; updated_at: string };

let cache: Record<string, ProductImageRecord> | null = null;
export function readProductImageManifest(): Record<string, ProductImageRecord> {
  if (cache) return cache;
  try { cache = JSON.parse(readFileSync(path.join(process.cwd(), "public", "products", "manifest.json"), "utf8")); } catch { cache = {}; }
  return cache!;
}
