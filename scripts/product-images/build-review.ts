/** Builds WORK/review-items.json: one entry per product with candidates (OFF or Commons), with contact sheet + legend. */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { WORK, readJson, writeJson, catalogQuantity, type CatalogRow } from "./lib";

type OffEntry = { product: CatalogRow; candidates: { code: string; source: string; product_name: string; brands: string; quantity: string | null; countries: string[]; size: string; imgid: string | null; angle: number; preview: string | null; source_url: string }[] };
type CommonsEntry = { product: CatalogRow; candidates: { title: string; page_url: string; file_url: string; license: string; artist: string; description: string; preview: string | null }[] };

const off = readJson<Record<string, OffEntry>>(path.join(WORK, "candidates.json"), {});
const commons = readJson<Record<string, CommonsEntry>>(path.join(WORK, "commons.json"), {});
const prior = readJson<Record<string, unknown>>(path.join(WORK, "final-map.json"), {});
const onlyMissing = process.argv.includes("--only-missing");
const items: unknown[] = [];
for (const [slug, e] of Object.entries(off)) {
  if (!e.candidates.length || (onlyMissing && prior[slug])) continue;
  const sheet = execFileSync("pnpm", ["exec", "tsx", "scripts/product-images/make-sheet.ts", slug], { encoding: "utf8" }).trim().split("\n").pop();
  const q = catalogQuantity(e.product);
  items.push({ slug, kind: "packaging", spec: { brand: e.product.brand, name: e.product.name, pack: e.product.pack_label, amount: `${q.amount} ${q.unit}`, category: e.product.category }, sheet,
    candidates: e.candidates.map((c, i) => ({ n: i + 1, code: c.code, source: c.source, listed_name: c.product_name, listed_brand: c.brands, listed_quantity: c.quantity, countries: c.countries.slice(0, 3), size_hint: c.size, imgid: c.imgid, angle: c.angle, source_url: c.source_url, preview: c.preview })) });
}
for (const [slug, e] of Object.entries(commons)) {
  if (!e.candidates.length || (onlyMissing && prior[slug])) continue;
  const sheet = execFileSync("pnpm", ["exec", "tsx", "scripts/product-images/make-sheet.ts", slug, "--commons"], { encoding: "utf8" }).trim().split("\n").pop();
  items.push({ slug, kind: "commodity", spec: { brand: e.product.brand, name: e.product.name, pack: e.product.pack_label, category: e.product.category }, sheet,
    candidates: e.candidates.map((c, i) => ({ n: i + 1, title: c.title, page_url: c.page_url, file_url: c.file_url, license: c.license, artist: c.artist, description: c.description, preview: c.preview })) });
}
writeJson(path.join(WORK, "review-items.json"), items);
console.log(`review items: ${items.length}`);
