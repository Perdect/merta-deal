import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { haversineKm } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Route ETA between two points. Uses Google Distance Matrix when a server key exists;
 * otherwise returns a straight-line estimate clearly flagged as `estimate: true`.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const [olat, olng, dlat, dlng] = ["olat", "olng", "dlat", "dlng"].map((k) => Number(p.get(k)));
  if ([olat, olng, dlat, dlng].some((n) => Number.isNaN(n))) return NextResponse.json({ error: "olat, olng, dlat, dlng required" }, { status: 400 });
  const key = serverEnv().mapsServerKey;
  if (key) {
    const r = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${olat},${olng}&destinations=${dlat},${dlng}&mode=driving&departure_time=now&key=${key}`);
    const d = await r.json() as { status: string; rows: { elements: { status: string; distance: { value: number }; duration_in_traffic?: { value: number }; duration: { value: number } }[] }[] };
    const el = d.rows?.[0]?.elements?.[0];
    if (d.status === "OK" && el?.status === "OK") {
      return NextResponse.json({ estimate: false, distance_km: el.distance.value / 1000, duration_min: Math.round((el.duration_in_traffic ?? el.duration).value / 60), source: "google_distance_matrix" });
    }
    console.warn("maps/eta: Google Distance Matrix returned", d.status, (d as { error_message?: string }).error_message ?? "");
  }
  const km = haversineKm(olat, olng, dlat, dlng);
  return NextResponse.json({ estimate: true, distance_km: Number(km.toFixed(2)), duration_min: Math.max(2, Math.round((km * 1.3 / 22) * 60)), source: "straight_line", note: key ? "Distance Matrix returned no route" : "GOOGLE_MAPS_SERVER_API_KEY not configured" });
}
