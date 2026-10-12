import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

/** The one public address. Production traffic on *.vercel.app is sent here permanently (308). */
const CANONICAL_HOST = (() => { try { return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").host; } catch { return ""; } })();

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  // Consolidate duplicate hosts onto mertadeal.com so search engines index one copy. Preview
  // deployments keep their own URLs, and /api stays put so webhooks and in-flight calls never bounce.
  // Staff portals (admin, store, rider) and their sign-in stay reachable on vercel.app with no redirect;
  // they are noindex, so this doesn't create duplicate pages for search engines.
  const path = request.nextUrl.pathname;
  const staff = /^\/(admin|store|rider|login|forgot-password|api)(\/|$)/.test(path);
  if (process.env.VERCEL_ENV === "production" && CANONICAL_HOST && host !== CANONICAL_HOST && host.endsWith(".vercel.app") && !staff) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(url, 308);
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets, images, the service worker and manifest
    "/((?!_next/static|_next/image|\\.well-known|favicon.ico|icon.svg|icons/|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
