/**
 * Stage 4: publish approved images.
 *  - copies the approved variant to public/products/<slug>.webp (1000×1000 WebP)
 *  - writes public/products/manifest.json (source, licence, attribution, match notes per product)
 *  - regenerates the "PRODUCT IMAGES" block in supabase/seed.sql (UPDATE products/order_items by slug)
 *  - applies the same UPDATEs to the local database
 * Input: WORK/final.json = [{ slug, variant: "framed"|"cutout", pick: Pick, notes }]
 */
import path from "node:path";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { WORK, DB_URL, readJson, writeJson } from "./lib";
import type { Pick } from "./3-process";

type Final = { slug: string; variant: "framed" | "cutout"; pick: Pick; notes?: string; size_match?: string; confidence?: number };

const PUBLIC_DIR = path.resolve("public/products");
const MANIFEST = path.join(PUBLIC_DIR, "manifest.json");
const SEED = path.resolve("supabase/seed.sql");
const BEGIN = "-- BEGIN GENERATED PRODUCT IMAGES (scripts/product-images/4-publish.ts) — do not edit by hand";
const END = "-- END GENERATED PRODUCT IMAGES";

async function main() {
  const finals = readJson<Final[]>(path.join(WORK, "final.json"), []);
  const processed = readJson<Record<string, { framed: string | null; cutout: string | null }>>(path.join(WORK, "processed.json"), {});
  mkdirSync(PUBLIC_DIR, { recursive: true });
  const manifest: Record<string, unknown> = readJson(MANIFEST, {});
  const rows: { slug: string; url: string }[] = [];
  const published = new Set<string>();
  for (const f of finals) {
    const src = processed[f.slug]?.[f.variant] ?? processed[f.slug]?.framed;
    if (!src || !existsSync(src)) { console.log(`${f.slug}: processed file missing, skipped`); continue; }
    // Content-hashed filename. next/image and the browser both cache by src, so reusing one path for
    // an updated photo keeps serving the old bytes for hours; a new name can never go stale. (A query
    // string would not do: Next 16 rejects local srcs with one unless images.localPatterns lists the
    // exact search string, which a per-file hash cannot satisfy.)
    const v = createHash("sha1").update(readFileSync(src)).digest("hex").slice(0, 8);
    const file = `${f.slug}.${v}.webp`;
    copyFileSync(src, path.join(PUBLIC_DIR, file));
    const url = `/products/${file}`;
    published.add(file);
    const p = f.pick;
    manifest[f.slug] = {
      file: url, version: v, variant: f.variant, kind: p.kind,
      source: p.source === "retail" ? `${p.retailer ?? "Retail listing"} product listing` : p.source === "supplied" ? "Supplied by the retailer" : p.source === "commons" ? "Wikimedia Commons" : p.source === "obf" ? "Open Beauty Facts" : p.source === "opf" ? "Open Products Facts" : "Open Food Facts",
      source_url: p.source === "retail" || p.source === "supplied" ? (p.page_url ?? null) : p.source === "commons" ? p.page_url : p.code ? `https://world.open${p.source === "obf" ? "beauty" : p.source === "opf" ? "products" : "food"}facts.org/product/${p.code}` : null,
      license: p.source === "retail" ? "Brand/manufacturer pack shot from a retail product listing" : p.source === "supplied" ? (p.license ?? "Brand/manufacturer pack shot, used by the retailer to list the product") : p.source === "commons" ? p.license : "CC BY-SA 3.0",
      license_url: p.source === "retail" || p.source === "supplied" || p.source === "commons" ? undefined : "https://creativecommons.org/licenses/by-sa/3.0/",
      attribution: p.source === "retail" ? (p.credit ?? p.retailer ?? null) : p.source === "supplied" ? (p.credit ?? p.artist ?? null) : p.source === "commons" ? (p.artist || p.credit || "Wikimedia Commons contributors") : "Open Food Facts contributors",
      barcode: p.code ?? null, matched_name: p.product_name ?? p.title ?? null, matched_quantity: p.quantity ?? null, size_match: f.size_match ?? p.size_match ?? null,
      confidence: f.confidence ?? null, notes: f.notes ?? null, updated_at: new Date().toISOString(),
    };
    rows.push({ slug: f.slug, url });
  }
  // sweep superseded hashes so public/products only ever holds what the catalogue points at
  let swept = 0;
  for (const f of readdirSync(PUBLIC_DIR)) {
    if (!f.endsWith(".webp") || published.has(f)) continue;
    rmSync(path.join(PUBLIC_DIR, f), { force: true }); swept++;
  }
  writeJson(MANIFEST, manifest);

  // seed block
  const esc = (s: string) => s.replace(/'/g, "''");
  const kept = rows.map((r) => `'${esc(r.slug)}'`).join(", ");
  const sql = [BEGIN, "-- Product photos live in public/products/ (see manifest.json for source + licence). Keyed by product slug.",
    "-- Products absent from this list have no photo we would put in front of a customer; their cards show the neutral tile.",
    kept ? `update public.products set image_url = null where image_url like '/products/%' and slug not in (${kept});` : "",
    ...rows.map((r) => `update public.products set image_url = '${esc(r.url)}' where slug = '${esc(r.slug)}' and (image_url is null or image_url like '/products/%');`),
    "update public.order_items oi set image_url = p.image_url from public.products p where p.id = oi.product_id and oi.image_url is null;",
    END].filter(Boolean).join("\n");
  let seed = readFileSync(SEED, "utf8");
  if (seed.includes(BEGIN)) seed = seed.replace(new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END}`), sql);
  else seed = seed.trimEnd() + "\n\n" + sql + "\n";
  writeFileSync(SEED, seed);

  // apply locally
  const c = new Client({ connectionString: DB_URL }); await c.connect();
  await c.query(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n"));
  const { rows: cnt } = await c.query("select count(*) filter (where image_url is not null) as with_image, count(*) as total from public.products");
  await c.end();
  console.log(`published ${rows.length} images (${swept} superseded file(s) swept) → public/products; DB: ${cnt[0].with_image}/${cnt[0].total} products have images`);
}
main().catch((e) => { console.error(e); process.exit(1); });
