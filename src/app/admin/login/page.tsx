import type { Metadata } from "next";
import { StaffLogin } from "@/components/auth/staff-login";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin login", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Admin sign-in. proxy.ts sends signed-out (or non-admin) visits to /admin/* here with ?next=. */
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string; signed_out?: string }> }) {
  const sp = await searchParams;
  const denied = sp.denied === "1";
  const user = denied ? await getSessionUser() : null;
  return <StaffLogin portal="admin" next={sp.next} denied={denied} signedOut={sp.signed_out === "1"} signedInAs={user ? user.fullName ?? user.phone ?? "another account" : null} />;
}
