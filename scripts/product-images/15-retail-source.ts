/**
 * Sources catalogue-grade pack shots from the retail web — the same photos Amazon, Flipkart, JioMart
 * and BigBasket list these products with, which are the brands' own studio shots on white.
 *
 * Image search (Bing) gives us the candidate URLs plus the page each one sits on; we keep only images
 * hosted on retailer/brand CDNs, drop the marketplace-junk domains, then score every candidate the way
 * a catalogue would: resolution, sharpness, how much of the frame the pack fills, and how clean/white
 * the background is. Nothing is published from here — stage 16 renders contact sheets for visual QA.
 *
 * Usage: tsx 15-retail-source.ts [--slugs a,b] [--file slugs.json] [--all] [--per 8] [--force]
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { WORK, download, sleep, readJson, writeJson, loadCatalog, tokens, catalogQuantity, parseQuantity, sizeMatch, type CatalogRow } from "./lib";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** Retailer and brand CDNs that host manufacturer studio shots. Higher = preferred. */
const TRUSTED: { re: RegExp; score: number; name: string }[] = [
  { re: /(^|\.)media-amazon\.com$/, score: 30, name: "Amazon" },
  { re: /(^|\.)ssl-images-amazon\.com$/, score: 28, name: "Amazon" },
  { re: /(^|\.)flixcart\.com$/, score: 26, name: "Flipkart" },
  { re: /(^|\.)jiomart\.com$/, score: 24, name: "JioMart" },
  { re: /(^|\.)bbassets\.com$/, score: 24, name: "BigBasket" },
  { re: /(^|\.)bigbasket\.com$/, score: 24, name: "BigBasket" },
  { re: /(^|\.)dmartstatic\.com$/, score: 22, name: "DMart" },
  { re: /(^|\.)cdn\.zeptonow\.com$/, score: 22, name: "Zepto" },
  { re: /(^|\.)blinkit\.com$/, score: 22, name: "Blinkit" },
  { re: /(^|\.)grofers\.com$/, score: 22, name: "Blinkit" },
  { re: /(^|\.)cloudfront\.net$/, score: 12, name: "CDN" },
  { re: /(^|\.)shopify\.com$/, score: 10, name: "Shopify store" },
  { re: /(^|\.)myntassets\.com$/, score: 10, name: "Myntra" },
  { re: /(^|\.)nykaa\.com$/, score: 14, name: "Nykaa" },
  { re: /(^|\.)netmeds\.com$/, score: 12, name: "Netmeds" },
  { re: /(^|\.)apollopharmacy\.in$/, score: 12, name: "Apollo" },
  { re: /(^|\.)itcstore\.in$/, score: 26, name: "ITC Store" },
  { re: /(^|\.)hul\.co\.in$/, score: 26, name: "HUL" },
  { re: /(^|\.)amul\.com$/, score: 26, name: "Amul" },
  { re: /(^|\.)patanjaliayurved\.net$/, score: 24, name: "Patanjali" },
  { re: /(^|\.)mdhspices\.com$/, score: 26, name: "MDH" },
  { re: /(^|\.)everestspices\.com$/, score: 26, name: "Everest" },
  { re: /(^|\.)tataconsumer\.com$/, score: 26, name: "Tata Consumer" },
];
/** User-submitted marketplaces, stock libraries and aggregators: watermarked, mislabelled or low-res. */
const BLOCKED = /(imimg\.com|indiamart|alamy|shutterstock|dreamstime|istockphoto|gettyimages|123rf|pinterest|pinimg|ebayimg|aliexpress|alicdn|lookaside|fbcdn|ytimg|youtube|wikimedia|tradeindia|exportersindia|justdial|olx|quikr|instagram)/i;

type Cand = {
  slug: string; url: string; page: string; host: string; retailer: string; title: string;
  w: number; h: number; sharpness: number; aspect: number; coverage: number; bgScore: number; whiteCorners: number;
  hostScore: number; titleScore: number; score: number; preview: string; file: string;
};

/** Ask each CDN for its largest rendition — the thumbnail in search results is not what we publish. */
function upscale(u: string): string {
  try {
    const url = new URL(u);
    if (/media-amazon|ssl-images-amazon/.test(url.hostname)) {
      // .../I/<id>._AC_SX300_.jpg  ->  .../I/<id>._SL1600_.jpg
      url.pathname = url.pathname.replace(/\.(_[A-Z0-9_,]+_)?\.(jpg|jpeg|png)$/i, ".$2").replace(/\.(jpg|jpeg|png)$/i, "._SL1600_.$1");
      return url.toString();
    }
    if (/flixcart/.test(url.hostname)) return u.replace(/\/image\/\d+\/\d+\//, "/image/832/832/");
    if (/bbassets|bigbasket/.test(url.hostname)) return u.replace(/\/p\/[a-z]\//, "/p/xxl/");
    if (/jiomart/.test(url.hostname)) return u.replace(/\/(small|medium|thumb)\//, "/original/");
    if (/zeptonow|blinkit|grofers/.test(url.hostname)) return u.replace(/tr:w-\d+,h-\d+/, "tr:w-1200,h-1200");
    return u;
  } catch { return u; }
}

function hostRank(host: string) {
  for (const t of TRUSTED) if (t.re.test(host)) return t;
  return null;
}

/** Bing image search: each result is a JSON blob in an `m="…"` attribute with the real media URL. */
async function searchImages(q: string): Promise<{ url: string; page: string; title: string; w: number; h: number }[]> {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&qft=+filterui:imagesize-large&form=IRFLTR&first=1`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9", Accept: "text/html" }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) { await sleep(1500 * (i + 1)); continue; }
      const html = await r.text();
      const out: { url: string; page: string; title: string; w: number; h: number }[] = [];
      for (const m of html.matchAll(/m="(\{[^"]+\})"/g)) {
        try {
          const j = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'"));
          if (j.murl) out.push({ url: j.murl as string, page: (j.purl as string) ?? "", title: (j.t as string) ?? "", w: Number(j.mw ?? 0), h: Number(j.mh ?? 0) });
        } catch { /* skip malformed blob */ }
      }
      return out;
    } catch { await sleep(1500 * (i + 1)); }
  }
  return [];
}

/** Objective look-of-the-photo metrics: sharp, filling the frame, on a clean bright background. */
async function metrics(file: string) {
  const meta = await sharp(file, { failOn: "none", limitInputPixels: 1e9 }).metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  const { data, info } = await sharp(file, { failOn: "none" }).rotate().flatten({ background: "#ffffff" }).greyscale()
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).normalise().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; const lap = -4 * data[i] + data[i - 1] + data[i + 1] + data[i - W] + data[i + W];
    sum += lap; sumSq += lap * lap; n++;
  }
  const sharpness = n ? sumSq / n - (sum / n) ** 2 : 0;
  const box = Math.max(8, Math.floor(Math.min(w, h) * 0.07));
  // sharp's .stats() reads the INPUT image and ignores pending pipeline ops, so each corner has to be
  // materialised to its own buffer first — otherwise every corner reports the whole image's statistics.
  const corner = async (left: number, top: number) => {
    try {
      const buf = await sharp(file, { failOn: "none" }).flatten({ background: "#ffffff" }).extract({ left, top, width: box, height: box }).png().toBuffer();
      const s = await sharp(buf).stats();
      return { mean: s.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3, std: s.channels.slice(0, 3).reduce((a, c) => a + c.stdev, 0) / 3 };
    } catch { return null; }
  };
  let bgScore = 0, whiteCorners = 0;
  const cs = (await Promise.all([corner(0, 0), corner(Math.max(0, w - box), 0), corner(0, Math.max(0, h - box)), corner(Math.max(0, w - box), Math.max(0, h - box))])).filter(Boolean) as { mean: number; std: number }[];
  if (cs.length) {
    whiteCorners = cs.filter((c) => c.mean > 235 && c.std < 12).length;
    const mean = cs.reduce((a, c) => a + c.mean, 0) / cs.length, std = cs.reduce((a, c) => a + c.std, 0) / cs.length;
    bgScore = Math.max(0, Math.min(1, (mean - 170) / 85)) * Math.max(0, Math.min(1, 1 - std / 40));
  }
  let coverage = 1;
  try { const t = await sharp(file, { failOn: "none" }).flatten({ background: "#ffffff" }).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true }); coverage = (t.info.width * t.info.height) / ((w || 1) * (h || 1)); } catch { /* keep 1 */ }
  return { w, h, sharpness, aspect: w && h ? Math.max(w / h, h / w) : 9, coverage, bgScore, whiteCorners };
}

/** How well the result's own title matches the catalogue row — catches wrong brand/variant early. */
function titleMatch(row: CatalogRow, title: string) {
  const want = new Set([...tokens(row.name), ...tokens(row.brand)]);
  if (!want.size) return 0;
  const got = new Set(tokens(title));
  let hit = 0; for (const t of want) if (got.has(t)) hit++;
  const brandHit = row.brand ? tokens(row.brand).every((t) => got.has(t)) : true;
  return (hit / want.size) * (brandHit ? 1 : 0.45);
}

function scoreOf(m: Awaited<ReturnType<typeof metrics>>, hostScore: number, titleScore: number, sizeOk: boolean) {
  let s = 0;
  s += Math.min(26, (m.w * m.h) / 1e6 * 10);                    // resolution
  s += Math.min(26, (m.sharpness / 500) * 26);                  // sharpness
  s += m.aspect > 2.0 ? -40 : m.aspect > 1.5 ? -10 : 12;        // square-ish, not a strip crop
  s += Math.min(16, m.coverage * 30);                           // pack fills the frame
  s += m.bgScore * 22 + m.whiteCorners * 5;                     // clean white studio background
  s += hostScore;                                               // retailer/brand CDN
  s += titleScore * 30;                                         // listing title matches this SKU
  if (sizeOk) s += 8;
  if (m.w < 500 || m.h < 500) s -= 30;
  if (m.sharpness < 90) s -= 25;
  return Math.round(s);
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const per = Number(arg("--per") ?? 8);
  const force = args.includes("--force");
  const catalog = await loadCatalog();
  let slugs: string[] = arg("--slugs")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (!slugs.length && arg("--file")) slugs = readJson<string[]>(path.resolve(arg("--file")!), []);
  if (!slugs.length || args.includes("--all")) slugs = catalog.map((c) => c.slug);

  const out = readJson<Record<string, Cand[]>>(path.join(WORK, "retail-candidates.json"), {});
  let done = 0;
  for (const slug of slugs) {
    done++;
    if (out[slug]?.length && !force) { console.log(`[${done}/${slugs.length}] ${slug}: cached (${out[slug].length})`); continue; }
    const row = catalog.find((c) => c.slug === slug);
    if (!row) { console.log(`[${done}/${slugs.length}] ${slug}: not in catalogue`); continue; }

    const brand = row.brand ?? "";
    const pack = row.pack_label ?? "";
    const queries = [
      `${brand} ${row.name} ${pack} pack front`.replace(/\s+/g, " ").trim(),
      `${brand} ${row.name} ${pack} buy online india`.replace(/\s+/g, " ").trim(),
    ];
    const seen = new Set<string>();
    const raw: { url: string; page: string; title: string; w: number; h: number }[] = [];
    for (const q of queries) {
      for (const r of await searchImages(q)) {
        const key = r.url.split("?")[0];
        if (seen.has(key)) continue; seen.add(key); raw.push(r);
      }
      await sleep(900);
      if (raw.length > 45) break;
    }

    const ranked = raw.map((r) => {
      let host = ""; try { host = new URL(r.url).hostname; } catch { return null; }
      if (BLOCKED.test(host) || BLOCKED.test(r.page)) return null;
      const t = hostRank(host);
      if (!t) return null;                           // retailer/brand CDNs only
      if (r.w && r.h && (r.w < 400 || r.h < 400)) return null;
      return { ...r, host, retailer: t.name, hostScore: t.score, titleScore: titleMatch(row, `${r.title} ${r.page}`) };
    }).filter(Boolean) as (typeof raw[number] & { host: string; retailer: string; hostScore: number; titleScore: number })[];
    ranked.sort((a, b) => b.hostScore + b.titleScore * 30 - (a.hostScore + a.titleScore * 30));

    const cands: Cand[] = [];
    const wantQty = catalogQuantity(row);
    for (const [i, r] of ranked.slice(0, per * 2).entries()) {
      if (cands.length >= per) break;
      const big = upscale(r.url);
      const file = path.join(WORK, "retail-raw", slug, `${i}.img`);
      mkdirSync(path.dirname(file), { recursive: true });
      if (!(await download(big, file)) && !(await download(r.url, file))) continue;
      let m; try { m = await metrics(file); } catch { continue; }
      if (!m.w || !m.h) continue;
      const sizeOk = sizeMatch(wantQty, parseQuantity(r.title)) !== "different";
      const preview = path.join(WORK, "retail-prev", slug, `${i}.jpg`);
      mkdirSync(path.dirname(preview), { recursive: true });
      try { await sharp(file, { failOn: "none" }).rotate().flatten({ background: "#ffffff" }).resize({ width: 420, height: 420, fit: "inside" }).jpeg({ quality: 86 }).toFile(preview); } catch { continue; }
      cands.push({
        slug, url: big, page: r.page, host: r.host, retailer: r.retailer, title: r.title,
        ...m, sharpness: Math.round(m.sharpness), aspect: Number(m.aspect.toFixed(2)), coverage: Number(m.coverage.toFixed(2)), bgScore: Number(m.bgScore.toFixed(2)),
        hostScore: r.hostScore, titleScore: Number(r.titleScore.toFixed(2)),
        score: scoreOf(m, r.hostScore, r.titleScore, sizeOk), preview, file,
      });
    }
    cands.sort((a, b) => b.score - a.score);
    out[slug] = cands;
    writeJson(path.join(WORK, "retail-candidates.json"), out);
    const best = cands[0];
    console.log(`[${done}/${slugs.length}] ${slug}: ${raw.length} results → ${cands.length} usable${best ? ` · best ${best.score} (${best.retailer} ${best.w}×${best.h} lap=${best.sharpness} bg=${best.bgScore} corners=${best.whiteCorners})` : ""}`);
  }
  const total = Object.values(out).filter((v) => v.length).length;
  console.log(`\n${total} products have retail candidates`);
}
main().catch((e) => { console.error(e); process.exit(1); });
