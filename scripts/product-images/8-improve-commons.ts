/**
 * Quality-first Commons candidates for commodity products (fresh produce, loose goods).
 * Scores each file for resolution, sharpness and clean background, keeps the best, builds previews.
 * Usage: tsx 8-improve-commons.ts --slugs a,b --queries '{"slug":["q1","q2"]}'
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { WORK, fetchJson, download, sleep, readJson, writeJson } from "./lib";

type MwPage = { title: string; imageinfo?: { url: string; descriptionurl: string; thumburl?: string; width: number; height: number; mime: string; extmetadata?: Record<string, { value: string }> }[] };
export type CommonsQCandidate = { slug: string; title: string; page_url: string; file_url: string; license: string; artist: string; credit: string; w: number; h: number; sharpness: number; bgScore: number; coverage: number; score: number; preview: string };

const OK = /^(cc0|public domain|pd|cc by(-sa)?( \d(\.\d)?)?|cc-by(-sa)?[- \d.]*)/i;

async function metrics(file: string) {
  const g = await sharp(file, { failOn: "none" }).rotate().greyscale().resize({ width: 500, height: 500, fit: "inside", withoutEnlargement: true }).normalise().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = g; const W = info.width, H = info.height;
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; const lap = -4 * data[i] + data[i - 1] + data[i + 1] + data[i - W] + data[i + W]; sum += lap; sumSq += lap * lap; n++; }
  const sharpness = sumSq / n - (sum / n) ** 2;
  const meta = await sharp(file).metadata(); const w = meta.width ?? 0, h = meta.height ?? 0;
  const corner = async (left: number, top: number) => { const s = await sharp(file, { failOn: "none" }).extract({ left, top, width: Math.max(8, Math.floor(w * 0.08)), height: Math.max(8, Math.floor(h * 0.08)) }).stats(); return { mean: s.channels.reduce((a, c) => a + c.mean, 0) / s.channels.length, std: s.channels.reduce((a, c) => a + c.stdev, 0) / s.channels.length }; };
  let bgScore = 0;
  try { const cs = await Promise.all([corner(0, 0), corner(Math.floor(w * 0.92), 0), corner(0, Math.floor(h * 0.92)), corner(Math.floor(w * 0.92), Math.floor(h * 0.92))]); const mean = cs.reduce((a, c) => a + c.mean, 0) / 4, std = cs.reduce((a, c) => a + c.std, 0) / 4; bgScore = Math.max(0, Math.min(1, (mean - 150) / 105)) * Math.max(0, Math.min(1, 1 - std / 60)); } catch { /* 0 */ }
  let coverage = 1;
  try { const t = await sharp(file, { failOn: "none" }).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true }); coverage = (t.info.width * t.info.height) / ((w || 1) * (h || 1)); } catch { /* 1 */ }
  return { sharpness, bgScore, coverage };
}

async function search(q: string) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=800`;
  const d = await fetchJson<{ query?: { pages?: Record<string, MwPage> } }>(url);
  return Object.values(d?.query?.pages ?? {});
}

async function main() {
  const args = process.argv.slice(2);
  const slugs = args[args.indexOf("--slugs") + 1].split(",");
  const queries = JSON.parse(args.includes("--queries") ? args[args.indexOf("--queries") + 1] : "{}") as Record<string, string[]>;
  const out = readJson<Record<string, CommonsQCandidate[]>>(path.join(WORK, "quality-commons.json"), {});
  for (const slug of slugs) {
    const qs = queries[slug] ?? [slug.replace(/-\d.*$/, "").replace(/-/g, " ")];
    const seen = new Map<string, CommonsQCandidate>();
    for (const q of qs) {
      for (const page of await search(q)) {
        const ii = page.imageinfo?.[0]; if (!ii?.thumburl) continue;
        const license = (ii.extmetadata?.LicenseShortName?.value ?? "").trim();
        if (!OK.test(license) || !/^image\/(jpeg|png|webp)$/.test(ii.mime)) continue;
        if (ii.width < 700 || ii.height < 500) continue;
        const title = page.title.replace(/^File:/, "");
        if (seen.has(title)) continue;
        const strip = (x?: string) => (x ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        const raw = path.join(WORK, "cq-raw", slug, title.replace(/[^\w.-]+/g, "_").slice(0, 70) + ".jpg");
        if (!(await download(ii.thumburl, raw))) continue;
        let m; try { m = await metrics(raw); } catch { continue; }
        const mp = (ii.width * ii.height) / 1e6;
        let score = Math.min(25, mp * 6) + Math.min(35, (m.sharpness / 400) * 35) + m.bgScore * 25 + Math.min(15, m.coverage * 20);
        if (/(drawing|map|logo|diagram|chart|painting|illustration|engraving|sketch)/i.test(title)) score -= 50;
        if (m.sharpness < 150) score -= 20;
        const preview = path.join(WORK, "cq-prev", slug, title.replace(/[^\w.-]+/g, "_").slice(0, 60) + ".jpg");
        mkdirSync(path.dirname(preview), { recursive: true });
        try { await sharp(raw, { failOn: "none" }).rotate().resize({ width: 400, height: 400, fit: "inside" }).jpeg({ quality: 84 }).toFile(preview); } catch { continue; }
        seen.set(title, { slug, title, page_url: ii.descriptionurl, file_url: ii.url, license, artist: strip(ii.extmetadata?.Artist?.value).slice(0, 120), credit: strip(ii.extmetadata?.Credit?.value).slice(0, 120), w: ii.width, h: ii.height, sharpness: Math.round(m.sharpness), bgScore: Number(m.bgScore.toFixed(2)), coverage: Number(m.coverage.toFixed(2)), score: Math.round(score), preview });
        await sleep(250);
      }
      await sleep(900);
    }
    const ranked = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 9);
    out[slug] = ranked; writeJson(path.join(WORK, "quality-commons.json"), out);
    console.log(`${slug}: ${seen.size} files → best ${ranked[0]?.score ?? "-"} (${ranked[0]?.w}x${ranked[0]?.h} lap=${ranked[0]?.sharpness}) ${ranked[0]?.title ?? ""}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
