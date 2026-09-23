import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Reverse geocoding via Google Geocoding API. Returns ok:false with a clear message when the key is not configured. */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat")); const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (Number.isNaN(lat) || Number.isNaN(lng)) return NextResponse.json({ ok: false, message: "lat/lng required" }, { status: 400 });
  const key = serverEnv().mapsServerKey;
  if (!key) return NextResponse.json({ ok: false, message: "Google Maps API key not configured (GOOGLE_MAPS_SERVER_API_KEY). Coordinates were saved." });
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&region=in&key=${key}`);
  const d = await r.json() as { status: string; results: { formatted_address: string; address_components: { long_name: string; types: string[] }[] }[] };
  if (d.status !== "OK" || !d.results.length) return NextResponse.json({ ok: false, message: `Geocoding failed: ${d.status}` });
  const comps = d.results[0].address_components;
  const pick = (t: string) => comps.find((c) => c.types.includes(t))?.long_name;
  return NextResponse.json({ ok: true, formatted: d.results[0].formatted_address, street: pick("route"), area: pick("sublocality_level_1") ?? pick("sublocality") ?? pick("neighborhood"), city: pick("locality"), pincode: pick("postal_code") });
}
