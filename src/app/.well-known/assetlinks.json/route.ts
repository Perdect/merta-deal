import { NextResponse } from "next/server";

/**
 * Digital Asset Links for the Android app (Trusted Web Activity). Chrome checks this file to
 * confirm the app and the site belong together; without a matching certificate the app shows a
 * browser address bar. Fingerprints come from env so the Play App Signing key can be added without
 * a code change:
 *   ANDROID_PACKAGE_NAME=com.mertadeal.app (default)
 *   ANDROID_CERT_SHA256=AA:BB:…,CC:DD:…   (upload key and Play App Signing key, comma-separated)
 */
export const dynamic = "force-dynamic";

export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME?.trim() || "com.mertadeal.app";
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  const body = fingerprints.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints } }]
    : [];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=300" } });
}
