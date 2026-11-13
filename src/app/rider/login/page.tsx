import type { Metadata, Viewport } from "next";
import { StaffLogin } from "@/components/auth/staff-login";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Delivery partner login", robots: { index: false, follow: false }, manifest: "/rider.webmanifest", appleWebApp: { capable: true, statusBarStyle: "default", title: "MD Rider" }, icons: { apple: "/icons/rider-apple-touch-icon.png" } };
/** Same orange address bar as the rider app, so the sign-in screen already looks like it. */
export const viewport: Viewport = { themeColor: "#e8671f", width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };
export const dynamic = "force-dynamic";

/** Delivery partner sign-in. proxy.ts sends signed-out (or guest) visits to /rider/* here with ?next=. */
export default async function RiderLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string; signed_out?: string }> }) {
  const sp = await searchParams;
  const denied = sp.denied === "1";
  const user = denied ? await getSessionUser() : null;
  return <StaffLogin portal="rider" next={sp.next} denied={denied} signedOut={sp.signed_out === "1"} signedInAs={user ? user.fullName ?? user.phone ?? "another account" : null} />;
}
