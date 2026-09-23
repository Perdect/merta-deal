/**
 * Rebuilds picks.json from verified identities (OFF barcode or Commons file title) without re-searching.
 * Usage: tsx 5-recover.ts .image-pipeline-plan.json
 */
import path from "node:path";
import { WORK, fetchJson, readJson, writeJson, sleep, parseQuantity, sizeMatch, catalogQuantity, loadCatalog } from "./lib";
import type { Pick } from "./3-process";

type Plan = { slug: string; kind: "packaging" | "commodity"; code?: string; title?: string };
type OffProduct = { product?: { product_name?: string; quantity?: string; brands?: string; images?: Record<string, { imgid?: string; angle?: number | string; x1?: string | number | null; y1?: string | number | null; x2?: string | number | null; y2?: string | number | null }> } };
type MwPage = { title: string; imageinfo?: { url: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] };

async function main() {
  const plan = readJson<Plan[]>(process.argv[2], []);
  const catalog = new Map((await loadCatalog()).map((c) => [c.slug, c]));
  const picks: Pick[] = readJson<Pick[]>(path.join(WORK, "picks.json"), []);
  const done = new Set(picks.map((p) => p.slug));
  for (const p of plan) {
    if (done.has(p.slug)) continue;
    if (p.kind === "packaging" && p.code) {
      const host = "https://world.openfoodfacts.org";
      const d = await fetchJson<OffProduct>(`${host}/api/v2/product/${p.code}?fields=product_name,quantity,brands,images`);
      const imgs = d?.product?.images ?? {};
      const front = imgs.front_en ?? imgs.front_hi ?? imgs.front ?? Object.entries(imgs).find(([k]) => k.startsWith("front_"))?.[1] ?? (imgs["1"] ? { imgid: "1", angle: 0 } : undefined);
      if (!front?.imgid) { console.log(`${p.slug}: no front image for ${p.code}`); continue; }
      const crop = front.x1 != null && front.x2 != null && front.y1 != null && front.y2 != null && Number(front.x2) > Number(front.x1) ? { x1: Number(front.x1), y1: Number(front.y1), x2: Number(front.x2), y2: Number(front.y2) } : null;
      const row = catalog.get(p.slug);
      picks.push({ slug: p.slug, source: "off", code: p.code, imgid: String(front.imgid), angle: Number(front.angle ?? 0) || 0, crop, product_name: d?.product?.product_name, quantity: d?.product?.quantity ?? null, size_match: row ? sizeMatch(catalogQuantity(row), parseQuantity(d?.product?.quantity)) : "unknown", kind: "packaging" });
      console.log(`${p.slug}: ${p.code} imgid ${front.imgid} angle ${front.angle ?? 0}${crop ? " crop" : ""}`);
      await sleep(700);
    } else if (p.kind === "commodity" && p.title) {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent("File:" + p.title)}&prop=imageinfo&iiprop=url|extmetadata`;
      const d = await fetchJson<{ query?: { pages?: Record<string, MwPage> } }>(url);
      const page = Object.values(d?.query?.pages ?? {})[0]; const ii = page?.imageinfo?.[0];
      if (!ii) { console.log(`${p.slug}: commons file not found: ${p.title}`); continue; }
      const meta = ii.extmetadata ?? {}; const strip = (x?: string) => (x ?? "").replace(/<[^>]+>/g, "").trim();
      picks.push({ slug: p.slug, source: "commons", file_url: ii.url, title: p.title, page_url: ii.descriptionurl, license: strip(meta.LicenseShortName?.value), artist: strip(meta.Artist?.value).slice(0, 120), credit: strip(meta.Credit?.value).slice(0, 120), kind: "commodity" });
      console.log(`${p.slug}: ${p.title} (${strip(meta.LicenseShortName?.value)})`);
      await sleep(400);
    }
    writeJson(path.join(WORK, "picks.json"), picks);
  }
  console.log(`picks: ${picks.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
