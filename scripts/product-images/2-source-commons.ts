/**
 * Stage 1b: commodity photos for UNBRANDED / fresh / local products (no packaging exists for these).
 * Source: Wikimedia Commons, filtered to CC0 / Public domain / CC BY / CC BY-SA files. Branded products are
 * never given commodity photos — they get exact packaging photos or the neutral fallback tile.
 */
import path from "node:path";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { loadCatalog, fetchJson, download, sleep, WORK, readJson, writeJson, type CatalogRow } from "./lib";

export type CommonsCandidate = { source: "commons"; title: string; page_url: string; file_url: string; thumb_url: string; width: number; height: number; license: string; license_url: string | null; artist: string; credit: string; description: string; preview: string | null; query: string; score: number };
export type CommonsFile = Record<string, { product: CatalogRow; queries: string[]; candidates: CommonsCandidate[] }>;

/** Curated, exact-meaning search terms per product (Commons search is keyword based, so terms are chosen for the literal item). */
const QUERIES: Record<string, string[]> = {
  "onion-pyaz-1-kg": ["red onions bulbs", "onion allium cepa red"],
  "potato-aloo-1-kg": ["potatoes tubers", "potato solanum tuberosum"],
  "tomato-tamatar-1-kg": ["ripe tomatoes", "tomato fruit red"],
  "green-chilli-hari-mirch-100-g": ["fresh green chili peppers pile", "green chilli capsicum annuum fresh"],
  "coriander-leaves-dhaniya-patta-100-g": ["coriander leaves bunch", "fresh cilantro leaves"],
  "ginger-adrak-250-g": ["ginger root rhizome", "fresh ginger"],
  "lemon-nimbu-4-pcs": ["yellow lemons whole", "lemon fruit whole citrus"],
  "cauliflower-gobhi-1-pc": ["cauliflower whole head white", "cauliflower vegetable"],
  "spinach-palak-250-g": ["spinach leaves bunch", "fresh spinach"],
  "banana-kela-1-dozen": ["bananas bunch ripe", "banana fruit yellow"],
  "apple-shimla-1-kg": ["red apples fruit", "apple malus domestica red"],
  "pomegranate-anar-500-g": ["pomegranate fruit", "pomegranate whole"],
  "papaya-1-pc-approx-1-kg": ["papaya fruit ripe whole", "carica papaya fruit"],
  "chana-dal-loose-1-kg": ["split chickpea lentils", "chana dal split bengal gram yellow"],
  "masoor-dal-loose-1-kg": ["masoor dal", "red lentils split"],
  "moth-dal-rajasthani-1-kg": ["matki beans", "moth bean seeds dry"],
  "sona-masoori-rice-loose-5-kg": ["raw white rice grains", "uncooked rice grains close"],
  "sugar-sulphurless-1-kg": ["white sugar granulated", "sugar crystals"],
  "sugar-sulphurless-5-kg": ["white sugar granulated", "sugar crystals"],
  "merta-local-chakki-atta-sharbati-5-kg": ["whole wheat flour pile", "wheat flour heap brown atta"],
  "bajra-atta-pearl-millet-1-kg": ["pearl millet grains", "bajra grains pennisetum glaucum seeds"],
  "cashew-w320-250-g": ["cashew nuts", "cashews raw"],
  "raisins-kishmish-250-g": ["raisins", "golden raisins dried grapes"],
  "mustard-seeds-rai-200-g": ["black mustard seeds", "mustard seeds"],
  "nagauri-methi-dana-200-g": ["fenugreek seeds", "methi seeds"],
  "nagauri-pan-methi-100-g": ["kasuri methi dried fenugreek leaves", "dried fenugreek leaves"],
  "mathania-red-chilli-powder-250-g": ["red chilli powder", "chili powder ground"],
  "merta-dairy-desi-ghee-bilona-500-g": ["ghee clarified butter jar", "desi ghee"],
  "saras-desi-ghee-500-ml": ["ghee clarified butter", "desi ghee jar"],
  "merta-special-papad-moong-200-g": ["raw papadum uncooked", "papad dried uncooked"],
  "ker-sangri-dried-250-g": ["ker sangri", "sangri beans dried"],
  "rabodi-sun-dried-corn-papad-200-g": ["rabodi", "makki rabodi"],
  "desi-gud-chikki-peanut-250-g": ["peanut chikki", "chikki jaggery peanut"],
  "merta-special-kheech-wheat-daliya-500-g": ["broken wheat raw", "cracked wheat grains uncooked"],
  "rajasthani-mirchi-achar-pickle-500-g": ["mirchi achar", "green chilli pickle indian"],
  "aluminium-foil-9-m-9-m": ["aluminium foil box roll kitchen", "aluminum foil roll"],
  "garbage-bags-medium-30-bags": ["garbage bags roll black", "trash bags"],
};

const OK_LICENSES = /^(cc0|public domain|pd|cc by(-sa)?( \d(\.\d)?)?|cc-by(-sa)?[- \d.]*)/i;
type MwPage = { title: string; imageinfo?: { url: string; descriptionurl: string; thumburl?: string; width: number; height: number; mime: string; extmetadata?: Record<string, { value: string }> }[] };

async function searchCommons(q: string) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}&gsrnamespace=6&gsrlimit=15&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=500&origin=*`;
  const d = await fetchJson<{ query?: { pages?: Record<string, MwPage> } }>(url);
  return Object.values(d?.query?.pages ?? {});
}

function toCandidate(p: MwPage, q: string): CommonsCandidate | null {
  const ii = p.imageinfo?.[0]; if (!ii || !ii.thumburl) return null;
  const meta = ii.extmetadata ?? {};
  const license = (meta.LicenseShortName?.value ?? "").trim();
  if (!OK_LICENSES.test(license)) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(ii.mime)) return null;
  if (ii.width < 500 || ii.height < 400) return null;
  const strip = (s: string | undefined) => (s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const desc = strip(meta.ImageDescription?.value).slice(0, 240);
  const title = p.title.replace(/^File:/, "");
  // prefer photos over drawings/logos/maps and mid-size aspect ratios
  let score = 50;
  if (/\.(svg|gif)$/i.test(title)) score -= 100;
  if (/(drawing|map|logo|diagram|chart|painting|illustration)/i.test(title + " " + desc)) score -= 40;
  if (/\b(cc0|public domain)\b/i.test(license)) score += 10;
  const ar = ii.width / ii.height; if (ar > 0.6 && ar < 1.8) score += 10;
  if (ii.width >= 1200) score += 5;
  return { source: "commons", title, page_url: ii.descriptionurl, file_url: ii.url, thumb_url: ii.thumburl, width: ii.width, height: ii.height, license, license_url: meta.LicenseUrl?.value ?? null, artist: strip(meta.Artist?.value).slice(0, 120), credit: strip(meta.Credit?.value).slice(0, 120), description: desc, preview: null, query: q, score };
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
  const file = path.join(WORK, "commons.json");
  const out = readJson<CommonsFile>(file, {});
  const catalog = (await loadCatalog()).filter((p) => QUERIES[p.slug] && (only ? only.has(p.slug) : true));
  for (const p of catalog) {
    if (!only && out[p.slug]?.candidates?.length) continue;
    const seen = new Map<string, CommonsCandidate>();
    for (const q of QUERIES[p.slug]) {
      for (const page of await searchCommons(q)) { const c = toCandidate(page, q); if (c && !seen.has(c.title)) seen.set(c.title, c); }
      await sleep(1200);
      if (seen.size >= 10) break;
    }
    const ranked = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 6);
    if (process.env.DEBUG) console.log(`  ${p.slug}: ${seen.size} raw candidates`);
    for (const c of ranked) {
      const raw = path.join(WORK, "raw-commons", p.slug, c.title.replace(/[^\w.-]+/g, "_").slice(0, 80));
      if (!(await download(c.thumb_url, raw))) { if (process.env.DEBUG) console.log("  download failed", c.thumb_url); continue; }
      const preview = path.join(WORK, "cands-commons", p.slug, `${[...seen.keys()].indexOf(c.title)}.jpg`);
      mkdirSync(path.dirname(preview), { recursive: true });
      try { await sharp(raw, { failOn: "none" }).rotate().resize({ width: 400, height: 400, fit: "inside" }).jpeg({ quality: 82 }).toFile(preview); c.preview = preview; } catch (e) { if (process.env.DEBUG) console.log("  preview failed", (e as Error).message); }
      await sleep(300);
    }
    out[p.slug] = { product: p, queries: QUERIES[p.slug], candidates: ranked.filter((c) => c.preview) };
    writeJson(file, out);
    console.log(`${p.slug}: ${ranked.filter((c) => c.preview).length} commons candidates`);
  }
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
