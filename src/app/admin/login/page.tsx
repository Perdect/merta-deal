import type { Metadata, Viewport } from "next";
import { StaffLogin } from "@/components/auth/staff-login";
import { AdminPwa } from "@/components/admin/kit/pwa";
import { adminAppMetadata, adminAppViewport } from "@/components/pwa/admin-app";
import { getSessionUser } from "@/lib/supabase/server";

// Same manifest, icons and blue title bar as the admin frame: the sign-in page is where a signed-out installed app opens.
export const metadata: Metadata = { title: "Admin login", robots: { index: false, follow: false }, ...adminAppMetadata };
export const viewport: Viewport = adminAppViewport;
export const dynamic = "force-dynamic";

/** Admin sign-in. proxy.ts sends signed-out (or non-admin) visits to /admin/* here with ?next=. */
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string; signed_out?: string }> }) {
  const sp = await searchParams;
  const denied = sp.denied === "1";
  const user = denied ? await getSessionUser() : null;
  return (
    <>
      <StaffLogin portal="admin" next={sp.next} denied={denied} signedOut={sp.signed_out === "1"} signedInAs={user ? user.fullName ?? user.phone ?? "another account" : null} />
      {/* Service worker (so the offline page exists before the first sign-in) and silent updates; renders nothing. */}
      <AdminPwa />
    </>
  );
}
