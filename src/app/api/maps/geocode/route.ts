import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { site } from "@/config/site";

export const dynamic = "force-dynamic";

type Suggestion = { ok: true; source: "google" | "osm"; formatted: string; street?: string; area?: string; city?: string; pincode?: string };
const NO_MATCH = { ok: false, message: "Location pinned. Please type your house and area details." };
const UPSTREAM_MS = 4000;
/* A key that Google refuses (billing off, API disabled, referrer rules) is refused on every call; remembering
   that for a while saves a dead round trip in front of the OpenStreetMap answer on each pin and GPS tap. */
let googleDeniedUntil = 0;

/**
 * Reverse geocoding for "Use current location": Google Geocoding when GOOGLE_MAPS_SERVER_API_KEY is
 * set, otherwise OpenStreetMap Nominatim (free; identified by User-Agent, results cached per ~11 m so
 * repeat taps don't hit it, well within its 1 request/second policy). Customer-facing messages
 * never mention configuration.
 */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat")); const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return NextResponse.json({ ok: false, message: "lat/lng required" }, { status: 400 });
  const key = serverEnv().mapsServerKey;
  try {
    // Google first when a key is set; OpenStreetMap whenever Google declines (key restrictions, quota, API off).
    const tryGoogle = Boolean(key) && Date.now() > googleDeniedUntil;
    const result = (tryGoogle ? await google(lat, lng, key).catch(() => null) : null) ?? await osm(lat, lng);
    return NextResponse.json(result ?? NO_MATCH);
  } catch {
    return NextResponse.json(NO_MATCH);
  }
}

async function google(lat: number, lng: number, key: string): Promise<Suggestion | null> {
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&region=in&key=${key}`, { headers: { Referer: `${site.url}/` }, signal: AbortSignal.timeout(UPSTREAM_MS) });
  const d = await r.json() as { status: string; error_message?: string; results: { formatted_address: string; address_components: { long_name: string; types: string[] }[] }[] };
  if (d.status !== "OK" || !d.results.length) {
    if (d.status !== "ZERO_RESULTS") console.warn("maps/geocode: Google returned", d.status, d.error_message ?? "");
    if (d.status === "REQUEST_DENIED" || d.status === "OVER_DAILY_LIMIT" || d.status === "OVER_QUERY_LIMIT") googleDeniedUntil = Date.now() + 10 * 60_000;
    return null;
  }
  const comps = d.results[0].address_components;
  const pick = (t: string) => comps.find((c) => c.types.includes(t))?.long_name;
  return { ok: true, source: "google", formatted: d.results[0].formatted_address, street: pick("route"), area: pick("sublocality_level_1") ?? pick("sublocality") ?? pick("neighborhood"), city: pick("locality"), pincode: pick("postal_code") };
}

async function osm(lat: number, lng: number): Promise<Suggestion | null> {
  // ~11 m precision is plenty for an address suggestion and lets the cache absorb repeat requests.
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`;
  const r = await fetch(url, {
    headers: { "User-Agent": `MertaDeal/1.0 (${site.url}; ${site.supportEmail})`, "Accept-Language": "en-IN,en" },
    next: { revalidate: 60 * 60 * 24 * 7 }, signal: AbortSignal.timeout(UPSTREAM_MS),
  });
  if (!r.ok) return null;
  const d = await r.json() as { display_name?: string; address?: Record<string, string> };
  const a = d.address; if (!a) return null;
  return {
    ok: true, source: "osm", formatted: d.display_name ?? "",
    street: a.road ?? a.pedestrian ?? a.residential,
    area: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.hamlet ?? a.village,
    city: a.city ?? a.town ?? a.village ?? a.county,
    pincode: a.postcode?.replace(/\s/g, ""),
  };
}
