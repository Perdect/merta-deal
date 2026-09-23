import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Zone lookup by pincode and/or GPS coordinates. Returns fees, minimums and ETA for the zone. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const pincode = p.get("pincode") ?? undefined;
  const lat = p.get("lat") ? Number(p.get("lat")) : undefined;
  const lng = p.get("lng") ? Number(p.get("lng")) : undefined;
  if (!pincode && (lat == null || lng == null)) return NextResponse.json({ serviceable: false, message: "Provide a pincode or coordinates" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_serviceability", { p_pincode: pincode, p_lat: lat, p_lng: lng });
  if (error) return NextResponse.json({ serviceable: false, message: error.message }, { status: 500 });
  return NextResponse.json(data);
}
