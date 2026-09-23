import { NextResponse, type NextRequest } from "next/server";
import { qrSvg, qrPngDataUrl } from "@/lib/qr/generate";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** QR image for any path on this site: /api/qr?path=/qr/<storeId>&format=svg|png&size=512 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const path = sp.get("path") ?? "/start";
  if (!path.startsWith("/")) return NextResponse.json({ error: "path must be relative" }, { status: 400 });
  const url = `${env.siteUrl.replace(/\/$/, "")}${path}`;
  const size = Math.min(2048, Math.max(128, Number(sp.get("size") ?? 512)));
  if (sp.get("format") === "png") {
    const dataUrl = await qrPngDataUrl(url, size);
    const buf = Buffer.from(dataUrl.split(",")[1], "base64");
    return new NextResponse(buf, { headers: { "Content-Type": "image/png", "Content-Disposition": `inline; filename="merta-deal-qr.png"`, "Cache-Control": "public, max-age=3600" } });
  }
  const svg = await qrSvg(url, { size });
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
}
