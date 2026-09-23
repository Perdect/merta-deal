/**
 * Quality-first candidate gathering. For each target product it collects EVERY image of EVERY plausible
 * barcode (not just the OFF-selected "front"), scores each one objectively, keeps the best, and builds a
 * contact sheet for visual judging.
 *
 * Score rewards: resolution, sharpness (variance of Laplacian), portrait-ish aspect, subject coverage,
 * and a clean (bright, low-variance) background. It penalises strip crops and tiny/blurry files.
 * Usage: tsx 7-improve.ts --slugs a,b,c   |   --file slugs.json   [--per-barcode 6] [--search]
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { WORK, S3, splitCode, download, fetchJson, sleep, readJson, writeJson, loadCatalog, norm, tokens, catalogQuantity, parseQuantity, sizeMatch, type CatalogRow } from "./lib";

type ImgMeta = { imgid?: string; rev?: string; angle?: number | string; x1?: number | string | null; y1?: number | string | null; x2?: number | string | null; y2?: number | string | null; sizes?: Record<string, { w?: number; h?: number }> };
type OffProduct = { code?: string; product_name?: string; product_name_en?: string; brands?: string; quantity?: string; countries_tags?: string[]; images?: Record<string, ImgMeta>; unique_scans_n?: number };
export type QCandidate = { slug: string; code: string; imgid: string; angle: number; crop: { x1: number; y1: number; x2: number; y2: number } | null; product_name: string; brands: string; quantity: string | null; size_match: string; w: number; h: number; sharpness: number; aspect: number; coverage: number; bgScore: number; isFront: boolean; score: number; preview: string; source_url: string };

const HOST = "https://world.openfoodfacts.org";
const ALT_HOSTS: Record<string, string> = { obf: "https://world.openbeautyfacts.org", opf: "https://world.openproductsfacts.org" };

async function metrics(file: string) {
  const img = sharp(file, { failOn: "none", limitInputPixels: 1e9 });
  const meta = await img.metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  const g = await sharp(file, { failOn: "none" }).rotate().greyscale().resize({ width: 500, height: 500, fit: "inside", withoutEnlargement: true }).normalise().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = g; const W = info.width, H = info.height;
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; const lap = -4 * data[i] + data[i - 1] + data[i + 1] + data[i - W] + data[i + W]; sum += lap; sumSq += lap * lap; n++; }
  const sharpness = sumSq / n - (sum / n) ** 2;
  // background: sample the four corners of the original; bright + uniform = studio-ish
  // .stats() reads the INPUT image and ignores pending ops — materialise each corner before measuring.
  const corner = async (left: number, top: number) => { const b = await sharp(file, { failOn: "none" }).extract({ left, top, width: Math.max(8, Math.floor(w * 0.08)), height: Math.max(8, Math.floor(h * 0.08)) }).png().toBuffer(); const s = await sharp(b).stats(); return { mean: s.channels.reduce((a, c) => a + c.mean, 0) / s.channels.length, std: s.channels.reduce((a, c) => a + c.stdev, 0) / s.channels.length }; };
  let bgScore = 0;
  try {
    const cs = await Promise.all([corner(0, 0), corner(Math.floor(w * 0.92), 0), corner(0, Math.floor(h * 0.92)), corner(Math.floor(w * 0.92), Math.floor(h * 0.92))]);
    const mean = cs.reduce((a, c) => a + c.mean, 0) / 4, std = cs.reduce((a, c) => a + c.std, 0) / 4;
    bgScore = Math.max(0, Math.min(1, (mean - 150) / 105)) * Math.max(0, Math.min(1, 1 - std / 60));
  } catch { bgScore = 0; }
  let coverage = 1;
  try { const t = await sharp(file, { failOn: "none" }).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true }); coverage = (t.info.width * t.info.height) / ((w || 1) * (h || 1)); } catch { /* keep 1 */ }
  const aspect = w && h ? Math.max(w / h, h / w) : 9;
  return { w, h, sharpness, aspect, coverage, bgScore };
}

function scoreOf(m: Awaited<ReturnType<typeof metrics>>, isFront = false) {
  const mp = (m.w * m.h) / 1e6;
  let s = 0;
  s += Math.min(30, mp * 12);                       // resolution (full-size megapixels)
  s += Math.min(35, (m.sharpness / 400) * 35);      // sharpness
  s += m.aspect > 2.2 ? -45 : m.aspect > 1.7 ? -12 : 10;  // penalise strip crops
  s += Math.min(20, m.coverage * 40);               // product fills the frame
  s += m.bgScore * 20;                              // clean bright background
  if (m.w < 500 || m.h < 500) s -= 25;
  if (m.sharpness < 120) s -= 25;
  if (isFront) s += 30;  // an OFF contributor marked this image as the pack front
  return Math.round(s);
}

async function searchBarcodes(q: string, host = HOST): Promise<OffProduct[]> {
  const url = `${host}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=code,product_name,product_name_en,brands,quantity,countries_tags,unique_scans_n`;
  const d = await fetchJson<{ products?: OffProduct[] }>(url);
  return d?.products ?? [];
}

function relevance(p: CatalogRow, c: OffProduct) {
  const name = c.product_name_en || c.product_name || "";
  const hay = norm(`${c.brands ?? ""} ${name}`);
  const brandN = norm(p.brand);
  const brandOk = brandN ? brandN.split(" ").every((w) => hay.includes(w)) : true;
  const want = new Set(tokens(p.name.replace(/\(.*?\)/g, " ")));
  const have = new Set(tokens(name));
  const overlap = want.size ? [...want].filter((t) => have.has(t) || [...have].some((h) => h.startsWith(t) || t.startsWith(h))).length / want.size : 0;
  return (brandOk ? 1 : 0) * 50 + overlap * 40 + ((c.countries_tags ?? []).some((t) => t.includes("india")) ? 10 : 0);
}

async function main() {
  const args = process.argv.slice(2);
  const slugs = args.includes("--slugs") ? args[args.indexOf("--slugs") + 1].split(",") : readJson<string[]>(args.includes("--file") ? args[args.indexOf("--file") + 1] : "__none__", []);
  const perBarcode = Number(args.includes("--per-barcode") ? args[args.indexOf("--per-barcode") + 1] : 8);
  const doSearch = args.includes("--search");
  const hostKeys = args.includes("--hosts") ? args[args.indexOf("--hosts") + 1].split(",") : ["off"];
  const catalog = new Map((await loadCatalog()).map((c) => [c.slug, c]));
  const known = readJson<Record<string, { candidates: { code: string }[] }>>(path.join(WORK, "candidates.json"), {});
  const currentPicks = readJson<{ slug: string; code?: string }[]>(path.join(WORK, "picks.json"), []);
  const out = readJson<Record<string, QCandidate[]>>(path.join(WORK, "quality-candidates.json"), {});

  for (const slug of slugs) {
    const row = catalog.get(slug); if (!row) { console.log(`${slug}: not in catalog`); continue; }
    const codes = new Map<string, OffProduct>();
    for (const c of known[slug]?.candidates ?? []) codes.set(c.code, { code: c.code });
    for (const c of out[slug] ?? []) codes.set(c.code, { code: c.code, product_name: c.product_name, brands: c.brands, quantity: c.quantity ?? undefined });
    const cur = currentPicks.find((p) => p.slug === slug)?.code; if (cur) codes.set(cur, { code: cur });
    if (doSearch || codes.size === 0) {
      const clean = row.name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)/g, " ").replace(/[^\w\s'-]/g, " ").replace(/\s+/g, " ").trim();
      const brand = (row.brand ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
      const queries = [clean.toLowerCase().includes(brand.toLowerCase()) ? clean : `${brand} ${clean}`, brand].filter(Boolean);
      for (const key of hostKeys) {
        const host = key === "off" ? HOST : ALT_HOSTS[key];
        for (const q of queries) {
          for (const c of await searchBarcodes(q, host)) if (c.code && relevance(row, c) >= 60) codes.set(c.code, c);
          await sleep(6500);
          if (codes.size >= 8) break;
        }
        if (codes.size >= 8) break;
      }
    }
    const ranked = [...codes.values()].sort((a, b) => relevance(row, b) - relevance(row, a)).slice(0, 6);
    const cands: QCandidate[] = [];
    for (const c of ranked) {
      const code = c.code; if (!code) continue;
      const d = await fetchJson<{ product?: OffProduct }>(`${HOST}/api/v2/product/${code}?fields=code,product_name,product_name_en,brands,quantity,images`);
      const prod = d?.product; const images = prod?.images ?? {};
      await sleep(700);
      const numeric = Object.entries(images).filter(([k]) => /^\d+$/.test(k)).sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, perBarcode);
      const selected = Object.entries(images).filter(([k]) => k.startsWith("front"));
      const seenIds = new Set<string>();
      const list: { imgid: string; angle: number; crop: QCandidate["crop"]; fullW: number; fullH: number; isFront: boolean }[] = [];
      for (const [, m] of selected) { const id = m.imgid ? String(m.imgid) : null; if (!id || seenIds.has(id)) continue; seenIds.add(id); const fs = images[id]?.sizes?.full ?? m.sizes?.full ?? {}; list.push({ imgid: id, angle: Number(m.angle ?? 0) || 0, isFront: true, fullW: Number(fs.w ?? 0), fullH: Number(fs.h ?? 0), crop: m.x1 != null && m.x2 != null && Number(m.x2) > Number(m.x1) ? { x1: Number(m.x1), y1: Number(m.y1), x2: Number(m.x2), y2: Number(m.y2) } : null }); }
      for (const [k, m] of numeric) if (!seenIds.has(k)) { seenIds.add(k); const fs = m.sizes?.full ?? {}; list.push({ imgid: k, angle: 0, crop: null, isFront: false, fullW: Number(fs.w ?? 0), fullH: Number(fs.h ?? 0) }); }
      for (const im of list) {
        const raw = path.join(WORK, "quality-raw", slug, `${code}-${im.imgid}.jpg`);
        if (!(await download(`${S3}/${splitCode(code)}/${im.imgid}.400.jpg`, raw))) continue;
        let m;
        try { m = await metrics(raw); } catch { continue; }
        // measure sharpness/coverage on the 400px preview, but score resolution from the true original
        if (im.fullW && im.fullH) { m.w = im.fullW; m.h = im.fullH; m.aspect = Math.max(im.fullW / im.fullH, im.fullH / im.fullW); }
        const score = scoreOf(m, im.isFront);
        const preview = path.join(WORK, "quality-prev", slug, `${code}-${im.imgid}.jpg`);
        mkdirSync(path.dirname(preview), { recursive: true });
        try {
          let img = sharp(raw, { failOn: "none" }).rotate();
          if (im.angle) img = img.rotate(im.angle);
          await img.resize({ width: 400, height: 400, fit: "inside" }).jpeg({ quality: 84 }).toFile(preview);
        } catch { continue; }
        cands.push({ slug, code, imgid: im.imgid, angle: im.angle, crop: im.crop, isFront: im.isFront, product_name: prod?.product_name_en || prod?.product_name || "", brands: prod?.brands ?? "", quantity: prod?.quantity ?? null, size_match: sizeMatch(catalogQuantity(row), parseQuantity(prod?.quantity)), ...m, sharpness: Math.round(m.sharpness), aspect: Number(m.aspect.toFixed(2)), coverage: Number(m.coverage.toFixed(2)), bgScore: Number(m.bgScore.toFixed(2)), score, preview, source_url: `${HOST}/product/${code}` });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    out[slug] = cands.slice(0, 9);
    writeJson(path.join(WORK, "quality-candidates.json"), out);
    console.log(`${slug}: ${cands.length} images across ${ranked.length} barcodes → best ${cands[0]?.score ?? "-"} (${cands[0]?.w}x${cands[0]?.h} lap=${cands[0]?.sharpness})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
