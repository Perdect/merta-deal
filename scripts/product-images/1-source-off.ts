/**
 * Stage 1: find candidate packaging photos on Open Food/Beauty/Products Facts for every branded product.
 * Respects OFF limits (10 searches/min, 100 product reads/min). Output: WORK/candidates.json + WORK/cands/<slug>/<code>.jpg
 * Resumable: skips products that already have candidates unless --force. Optional: --only slug1,slug2  --queries extra.json
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { loadCatalog, fetchJson, download, sleep, WORK, S3, splitCode, normaliseOffImage, parseQuantity, catalogQuantity, sizeMatch, norm, tokens, readJson, writeJson, type CatalogRow } from "./lib";

type OffSearchProduct = { code: string; product_name?: string; product_name_en?: string; brands?: string; quantity?: string; countries_tags?: string[]; image_front_url?: string; unique_scans_n?: number; images?: Record<string, { imgid?: string; rev?: string; angle?: number | string; x1?: string | number | null; y1?: string | number | null; x2?: string | number | null; y2?: string | number | null }> };
export type Candidate = { code: string; source: "off" | "obf" | "opf"; product_name: string; brands: string; quantity: string | null; countries: string[]; scans: number; score: number; size: "exact" | "close" | "different" | "unknown"; brand_ok: boolean; name_overlap: number; imgid: string | null; angle: number; preview: string | null; source_url: string; query: string };
export type CandidateFile = Record<string, { product: CatalogRow; queries: string[]; candidates: Candidate[]; note?: string }>;

const HOSTS = { off: "https://world.openfoodfacts.org", obf: "https://world.openbeautyfacts.org", opf: "https://world.openproductsfacts.org" } as const;
const NON_FOOD = new Set(["bath-body", "oral-care", "hair-care", "laundry", "cleaning", "diapers", "beauty-lifestyle", "kitchen-essentials"]);
const UNBRANDED = new Set(["Merta Local", "Fresh Farm", "Nagauri", "Mathania"]);

function queriesFor(p: CatalogRow): string[] {
  const deaccent = (t: string) => t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const clean = deaccent(p.name).replace(/\(.*?\)/g, " ").replace(/[^\w\s'-]/g, " ").replace(/\s+/g, " ").trim();
  const brand = deaccent(p.brand ?? "");
  const q1 = clean.toLowerCase().includes(brand.toLowerCase()) ? clean : `${brand} ${clean}`;
  const qs = [q1];
  const words = tokens(clean).filter((w) => !norm(brand).split(" ").includes(w));
  if (words.length > 2) qs.push(`${brand} ${words.slice(0, 2).join(" ")}`);
  else if (brand) qs.push(brand);
  return [...new Set(qs.map((q) => q.trim()).filter(Boolean))];
}

function score(p: CatalogRow, c: OffSearchProduct, query: string): Candidate {
  const name = c.product_name_en || c.product_name || "";
  const brands = c.brands ?? "";
  const brandN = norm(p.brand); const hay = norm(`${brands} ${name}`);
  const brand_ok = brandN ? brandN.split(" ").every((w) => hay.includes(w)) : true;
  const want = new Set(tokens(p.name.replace(/\(.*?\)/g, " ")));
  const have = new Set(tokens(name));
  const overlap = want.size ? [...want].filter((t) => have.has(t) || [...have].some((h) => h.startsWith(t) || t.startsWith(h))).length / want.size : 0;
  const size = sizeMatch(catalogQuantity(p), parseQuantity(c.quantity));
  const countries = (c.countries_tags ?? []).map((t) => t.replace(/^en:/, ""));
  const scans = c.unique_scans_n ?? 0;
  let s = 0;
  s += brand_ok ? 40 : -30; s += overlap * 30; s += size === "exact" ? 25 : size === "close" ? 12 : size === "unknown" ? 0 : -15;
  s += countries.includes("india") ? 8 : 0; s += Math.min(8, Math.log10(scans + 1) * 4); s += c.image_front_url ? 5 : -100;
  const front = c.images?.front_en ?? c.images?.front_hi ?? c.images?.front ?? Object.entries(c.images ?? {}).find(([k]) => k.startsWith("front_"))?.[1];
  const host = HOSTS.off;
  return { code: c.code, source: "off", product_name: name, brands, quantity: c.quantity ?? null, countries, scans, score: Math.round(s), size, brand_ok, name_overlap: Number(overlap.toFixed(2)), imgid: front?.imgid ?? null, angle: Number(front?.angle ?? 0) || 0, preview: null, source_url: `${host}/product/${c.code}`, query };
}

async function search(host: string, q: string): Promise<OffSearchProduct[]> {
  const url = `${host}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30&fields=code,product_name,product_name_en,brands,quantity,countries_tags,image_front_url,unique_scans_n,images`;
  const d = await fetchJson<{ products?: OffSearchProduct[] }>(url);
  return d?.products ?? [];
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
  const extraQueries = args.includes("--queries") ? readJson<Record<string, string[]>>(args[args.indexOf("--queries") + 1], {}) : {};
  const file = path.join(WORK, "candidates.json");
  const out = readJson<CandidateFile>(file, {});
  const catalog = (await loadCatalog()).filter((p) => (only ? only.has(p.slug) : true));
  let searches = 0;
  for (const p of catalog) {
    if (UNBRANDED.has(p.brand ?? "") && !extraQueries[p.slug]) continue; // handled by the Commons stage
    if (!force && out[p.slug]?.candidates?.length && !extraQueries[p.slug]) continue;
    const qs = extraQueries[p.slug] ?? queriesFor(p);
    const hosts: (keyof typeof HOSTS)[] = NON_FOOD.has(p.category) ? ["off", "obf", "opf"] : ["off"];
    const seen = new Map<string, Candidate>();
    for (const q of qs) {
      for (const h of hosts) {
        const results = await search(HOSTS[h], q); searches++;
        for (const r of results) {
          if (!r.code || !r.image_front_url) continue;
          const c = score(p, r, q); c.source = h; c.source_url = `${HOSTS[h]}/product/${r.code}`;
          const prev = seen.get(r.code); if (!prev || prev.score < c.score) seen.set(r.code, c);
        }
        await sleep(6500); // 10 searches / minute
        if (seen.size >= 12 && h === "off") break;
      }
      if ([...seen.values()].some((c) => c.score >= 80)) break; // strong match already
    }
    const ranked = [...seen.values()].sort((a, b) => b.score - a.score).filter((c) => c.score > 0).slice(0, 5);
    // previews from the S3 mirror (raw imgid), rotated like OFF's selected front image
    for (const c of ranked) {
      if (!c.imgid) {
        const host = HOSTS[c.source];
        const d = await fetchJson<{ product?: { images?: Record<string, { imgid?: string; angle?: number | string }> } }>(`${host}/api/v2/product/${c.code}?fields=images`);
        const imgs = d?.product?.images ?? {};
        const front = imgs.front_en ?? imgs.front_hi ?? imgs.front ?? Object.entries(imgs).find(([k]) => k.startsWith("front_"))?.[1] ?? (imgs["1"] ? { imgid: "1", angle: 0 } : undefined);
        if (front?.imgid) { c.imgid = String(front.imgid); c.angle = Number(front.angle ?? 0) || 0; }
        await sleep(700);
      }
      if (!c.imgid) continue;
      const raw = path.join(WORK, "raw", p.slug, `${c.code}-${c.imgid}.400.jpg`);
      const ok = await download(`${S3}/${splitCode(c.code)}/${c.imgid}.400.jpg`, raw);
      if (!ok) continue;
      const preview = path.join(WORK, "cands", p.slug, `${c.code}.jpg`);
      try { await normaliseOffImage(raw, preview, { angle: c.angle }); c.preview = preview; } catch { c.preview = existsSync(raw) ? raw : null; }
    }
    out[p.slug] = { product: p, queries: qs, candidates: ranked.filter((c) => c.preview) };
    writeJson(file, out);
    console.log(`${p.slug}: ${ranked.filter((c) => c.preview).length} candidates (best ${ranked[0]?.score ?? "-"} ${ranked[0]?.product_name ?? ""} ${ranked[0]?.quantity ?? ""}) [${searches} searches]`);
  }
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
