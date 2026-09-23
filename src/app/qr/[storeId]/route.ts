import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Store QR landing. Encodes the immutable store id so printed codes survive renames/slug changes.
 * /qr/<storeId>?table=counter -> /s/<slug>?src=qr
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const supabase = await createClient();
  const { data } = /^[0-9a-f-]{36}$/.test(storeId)
    ? await supabase.from("stores").select("slug, status").eq("id", storeId).maybeSingle()
    : await supabase.from("stores").select("slug, status").eq("slug", storeId).maybeSingle();
  const url = new URL(data && data.status === "active" ? `/s/${data.slug}` : "/start", req.url);
  url.searchParams.set("src", "qr");
  const res = NextResponse.redirect(url, 307);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
