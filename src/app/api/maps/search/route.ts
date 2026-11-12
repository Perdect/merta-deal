import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { site } from "@/config/site";

export const dynamic = "force-dynamic";

const UPSTREAM_MS = 3500;
export type PlaceSuggestion = { title: string; subtitle: string; lat?: number; lng?: number; placeId?: string; source: "place" | "area" | "google" | "osm" };

/**
 * Address suggestions while the customer types (the picker debounces requests):
 * 1. Merta Deal's own landmarks and delivery areas (admin-pinned, matches Hinglish phrasing);
 * 2. Google Places autocomplete when GOOGLE_MAPS_SERVER_API_KEY is set (best local coverage) —
 *    returns place ids; coordinates come from /api/maps/place when one is picked;
 * 3. otherwise Photon (OpenStreetMap, built for search-as-you-type), limited to ~60 km around the city.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  const session = (req.nextUrl.searchParams.get("session") ?? "").slice(0, 64);
  if (q.length < 2) return NextResponse.json({ results: [] });

  const useGoogle = Boolean(serverEnv().mapsServerKey);
  const [local, fromGoogle] = await Promise.all([localPlaces(q), useGoogle ? google(q, session) : Promise.resolve([] as PlaceSuggestion[])]);
  // OpenStreetMap whenever Google is off or declines, so search is never worse than without a key.
  const remote = fromGoogle.length ? fromGoogle : await photon(q);
  const seen = new Set<string>();
  const results = [...local, ...remote].filter((r) => { const k = r.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
  return NextResponse.json({ results, provider: fromGoogle.length ? "google" : "osm" });
}

async function localPlaces(q: string): Promise<PlaceSuggestion[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("search_local_places" as never, { p_q: q, p_limit: 5 } as never);
    return ((data ?? []) as unknown as { title: string; subtitle: string; lat: number; lng: number; source: "place" | "area" }[])
      .map((r) => ({ title: r.title, subtitle: r.subtitle ? `${r.subtitle} · ${site.city}` : site.city, lat: r.lat, lng: r.lng, source: r.source }));
  } catch { return []; }
}

async function google(q: string, session: string): Promise<PlaceSuggestion[]> {
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": serverEnv().mapsServerKey, Referer: `${site.url}/` },
      body: JSON.stringify({
        input: q, includedRegionCodes: ["in"], languageCode: "en", ...(session ? { sessionToken: session } : {}),
        locationBias: { circle: { center: { latitude: site.center.lat, longitude: site.center.lng }, radius: 30000 } },
      }),
      cache: "no-store", signal: AbortSignal.timeout(UPSTREAM_MS),
    });
    if (!r.ok) { console.warn("maps/search: Google Places returned", r.status, (await r.text()).slice(0, 200)); return []; }
    const d = await r.json() as { suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } }[] };
    return (d.suggestions ?? []).flatMap((s) => {
      const p = s.placePrediction; if (!p) return [];
      return [{ title: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "", subtitle: p.structuredFormat?.secondaryText?.text ?? "", placeId: p.placeId, source: "google" as const }];
    });
  } catch { return []; }
}

async function photon(q: string): Promise<PlaceSuggestion[]> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${site.center.lat}&lon=${site.center.lng}&limit=12&lang=en`;
    const r = await fetch(url, { headers: { "User-Agent": `MertaDeal/1.0 (${site.url}; ${site.supportEmail})` }, next: { revalidate: 60 * 60 * 24 }, signal: AbortSignal.timeout(UPSTREAM_MS) });
    if (!r.ok) return [];
    const d = await r.json() as { features?: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[] };
    return (d.features ?? [])
      .filter((f) => f.properties.countrycode === "IN")
      .map((f) => {
        const p = f.properties;
        return { title: p.name ?? p.street ?? p.city ?? "", subtitle: [p.street && p.name ? p.street : null, p.district, p.city ?? p.county, p.state, p.postcode].filter(Boolean).join(", "), lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], source: "osm" as const };
      })
      .filter((s) => s.title && km(s.lat, s.lng) <= 60);
  } catch { return []; }
}

/** Straight-line distance from the city centre (km): keeps suggestions local. */
function km(lat: number, lng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat - site.center.lat) / 2) ** 2 + Math.cos(r(site.center.lat)) * Math.cos(r(lat)) * Math.sin(r(lng - site.center.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
