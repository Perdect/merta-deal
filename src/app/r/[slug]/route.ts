import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Editable short links for printed QR codes (admin → Settings → qr_links). /r/offers -> /c/grocery?coupon=... */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("value").eq("key", "qr_links").maybeSingle();
  const map = (data?.value as Record<string, string> | null) ?? {};
  const target = typeof map[slug] === "string" && map[slug].startsWith("/") ? map[slug] : "/start";
  const url = new URL(target, req.url);
  url.searchParams.set("src", `qr-${slug}`);
  const res = NextResponse.redirect(url, 307);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
