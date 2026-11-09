import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { site } from "@/config/site";
import { haversineKm } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Route ETA between two points. Uses the Google Routes API (computeRoutes, two-wheeler, traffic-aware)
 * when a server key exists — Distance Matrix is a legacy API Google no longer enables for new projects.
 * Otherwise, or when Google declines, a straight-line estimate clearly flagged as `estimate: true`.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const [olat, olng, dlat, dlng] = ["olat", "olng", "dlat", "dlng"].map((k) => Number(p.get(k)));
  if ([olat, olng, dlat, dlng].some((n) => Number.isNaN(n))) return NextResponse.json({ error: "olat, olng, dlat, dlng required" }, { status: 400 });
  const key = serverEnv().mapsServerKey;
  if (key) {
    try {
      const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters", Referer: `${site.url}/` },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: olat, longitude: olng } } },
          destination: { location: { latLng: { latitude: dlat, longitude: dlng } } },
          travelMode: "TWO_WHEELER", routingPreference: "TRAFFIC_AWARE", regionCode: "IN",
        }),
        cache: "no-store",
      });
      const d = await r.json() as { routes?: { duration?: string; distanceMeters?: number }[]; error?: { status?: string; message?: string } };
      const route = d.routes?.[0];
      if (r.ok && route?.duration && route.distanceMeters != null) {
        return NextResponse.json({ estimate: false, distance_km: route.distanceMeters / 1000, duration_min: Math.max(1, Math.round(parseFloat(route.duration) / 60)), source: "google_routes" });
      }
      console.warn("maps/eta: Google Routes returned", r.status, d.error?.status ?? "", (d.error?.message ?? "").slice(0, 200));
    } catch (e) { console.warn("maps/eta: Google Routes failed", (e as Error).message); }
  }
  const km = haversineKm(olat, olng, dlat, dlng);
  return NextResponse.json({ estimate: true, distance_km: Number(km.toFixed(2)), duration_min: Math.max(2, Math.round((km * 1.3 / 22) * 60)), source: "straight_line", note: key ? "Google Routes returned no route" : "GOOGLE_MAPS_SERVER_API_KEY not configured" });
}
