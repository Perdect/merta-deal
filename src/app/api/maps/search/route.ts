import { NextResponse, type NextRequest } from "next/server";
import { site } from "@/config/site";

export const dynamic = "force-dynamic";

/**
 * Address search for the map picker (OpenStreetMap Nominatim). Called only when the customer submits
 * a search (Nominatim's policy forbids search-as-you-type), biased to the area around the city and
 * cached per query so repeats don't reach Nominatim.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ results: [] });
  const { lat, lng } = site.center;
  const box = [lng - 0.35, lat + 0.25, lng + 0.35, lat - 0.25].join(","); // ~70 km × 55 km around the city
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=in&viewbox=${box}&q=${encodeURIComponent(q.toLowerCase().includes(site.city.toLowerCase()) ? q : `${q}, ${site.city}`)}`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": `MertaDeal/1.0 (${site.url}; ${site.supportEmail})`, "Accept-Language": "en-IN,en" },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!r.ok) return NextResponse.json({ results: [] });
    const d = await r.json() as { lat: string; lon: string; display_name: string; name?: string }[];
    return NextResponse.json({ results: d.map((x) => ({ lat: Number(x.lat), lng: Number(x.lon), title: x.name || x.display_name.split(",")[0], subtitle: x.display_name })) });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
