import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

/**
 * Resizes one of the shop's own pictures to a requested width and returns WebP.
 *
 * Why it exists: see src/lib/image-loader.ts. What it will touch is deliberately narrow, so it cannot be used
 * to fetch arbitrary addresses: a file under one of the public picture folders of this site, or a public
 * object in this project's Supabase storage. Widths are limited to the sizes next/image asks for. The answer
 * is cached for a year (every picture name is content-hashed or timestamped, so a name never changes its
 * content); if anything goes wrong the browser is sent to the original file, so a photo is never lost.
 */
const WIDTHS = [40, 48, 64, 72, 96, 128, 180, 256, 360, 414, 640, 768, 1024, 1280, 1536];
const LOCAL = /^\/(categories|products|brand|banners|og|icons|splash)\/[\w.\-/%]+\.(webp|png|jpe?g|avif)$/i;
const supabaseHost = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host; } catch { return ""; } })();
const YEAR = "public, max-age=31536000, s-maxage=31536000, immutable";
/** Refuse absurd sources rather than hold a function open on them. */
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

function sourceUrl(u: string, origin: string): URL | null {
  if (u.startsWith("/") && !u.startsWith("//") && !u.includes("..") && LOCAL.test(u.split("?")[0])) return new URL(u, origin);
  try {
    const url = new URL(u);
    if (url.protocol === "https:" && supabaseHost && url.host === supabaseHost && url.pathname.startsWith("/storage/v1/object/public/")) return url;
  } catch { /* not a URL */ }
  return null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const u = sp.get("u") ?? "";
  const src = sourceUrl(u, req.nextUrl.origin);
  if (!src) return NextResponse.json({ error: "This picture cannot be resized here." }, { status: 400 });
  const asked = Number(sp.get("w"));
  const width = WIDTHS.find((w) => w >= asked) ?? WIDTHS[WIDTHS.length - 1];
  const quality = Math.min(90, Math.max(40, Number(sp.get("q")) || 72));
  const original = () => NextResponse.redirect(src, { status: 302, headers: { "Cache-Control": "public, max-age=300" } });
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return original();
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/") || type.includes("svg")) return original();
    const input = Buffer.from(await res.arrayBuffer());
    if (input.byteLength > MAX_SOURCE_BYTES) return original();
    const out = await sharp(input, { failOn: "none" }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality, effort: 4 }).toBuffer();
    return new NextResponse(new Uint8Array(out), { status: 200, headers: { "Content-Type": "image/webp", "Cache-Control": YEAR, "CDN-Cache-Control": YEAR, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return original();
  }
}
