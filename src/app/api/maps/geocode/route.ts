import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { site } from "@/config/site";

export const dynamic = "force-dynamic";

type Suggestion = { ok: true; source: "google" | "osm"; formatted: string; street?: string; area?: string; city?: string; pincode?: string };
const NO_MATCH = { ok: false, message: "Location pinned. Please type your house and area details." };

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
    const result = key ? await google(lat, lng, key) : await osm(lat, lng);
    return NextResponse.json(result ?? NO_MATCH);
  } catch {
    return NextResponse.json(NO_MATCH);
  }
}

async function google(lat: number, lng: number, key: string): Promise<Suggestion | null> {
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&region=in&key=${key}`);
  const d = await r.json() as { status: string; results: { formatted_address: string; address_components: { long_name: string; types: string[] }[] }[] };
  if (d.status !== "OK" || !d.results.length) return null;
  const comps = d.results[0].address_components;
  const pick = (t: string) => comps.find((c) => c.types.includes(t))?.long_name;
  return { ok: true, source: "google", formatted: d.results[0].formatted_address, street: pick("route"), area: pick("sublocality_level_1") ?? pick("sublocality") ?? pick("neighborhood"), city: pick("locality"), pincode: pick("postal_code") };
}

async function osm(lat: number, lng: number): Promise<Suggestion | null> {
  // ~11 m precision is plenty for an address suggestion and lets the cache absorb repeat requests.
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`;
  const r = await fetch(url, {
    headers: { "User-Agent": `MertaDeal/1.0 (${site.url}; ${site.supportEmail})`, "Accept-Language": "en-IN,en" },
    next: { revalidate: 60 * 60 * 24 * 7 },
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
