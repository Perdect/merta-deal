import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Coordinates for a picked Google Places suggestion (same session token as the autocomplete). */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const session = (req.nextUrl.searchParams.get("session") ?? "").slice(0, 64);
  const key = serverEnv().mapsServerKey;
  if (!key || !/^[A-Za-z0-9_-]{10,300}$/.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${id}${session ? `?sessionToken=${encodeURIComponent(session)}` : ""}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "location,formattedAddress,displayName" }, cache: "no-store",
    });
    if (!r.ok) return NextResponse.json({ ok: false });
    const d = await r.json() as { location?: { latitude: number; longitude: number }; formattedAddress?: string };
    if (!d.location) return NextResponse.json({ ok: false });
    return NextResponse.json({ ok: true, lat: d.location.latitude, lng: d.location.longitude, formatted: d.formattedAddress ?? "" });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
