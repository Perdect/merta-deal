import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getAdminNotifications } from "@/lib/data/admin";
import { getLiveCounts } from "@/lib/data/admin-dashboard";
import { AdminShell } from "@/components/admin/kit/shell";
import { PortalTheme } from "@/components/shared/portal-theme";
import { createClient } from "@/lib/supabase/server";
import { env, isPushConfigured } from "@/lib/env";
import { adminAppMetadata, adminAppViewport } from "@/components/pwa/admin-app";

// The admin installs as its own app (manifest scope /admin, blue icon and title bar), apart from the shop and the rider app.
export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin | Merta Deal" }, robots: { index: false, follow: false }, ...adminAppMetadata };
export const viewport: Viewport = adminAppViewport;
export const dynamic = "force-dynamic";

/**
 * Admin frame (blue theme). proxy.ts already gates /admin; this re-checks on the server — role, active
 * account, and the database's own is_admin() — so a stale cookie or a deactivated admin never renders
 * admin data. Every admin server action and admin RPC checks again.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Everything the frame needs starts at once. The counts are RLS-protected and return nothing for a
  // non-admin, and nothing renders until the checks below have passed.
  const supabase = await createClient();
  const [user, { data: isAdmin }, { unread }, live] = await Promise.all([
    getSessionUser(), supabase.rpc("is_admin"), getAdminNotifications(1), getLiveCounts().catch(() => null),
  ]);
  if (!user) redirect("/admin/login");
  if (!isAdmin || (user.role !== "admin" && user.role !== "super_admin")) redirect("/admin/login?denied=1");
  return (
    <div className="theme-admin contents">
      <PortalTheme portal="admin" />
      <AdminShell user={{ name: user.fullName, email: user.email, role: user.role, avatarUrl: user.avatarUrl }} userId={user.id} unread={unread} counts={live?.badges ?? null} push={{ configured: isPushConfigured(), vapidPublicKey: env.vapidPublicKey }}>
        {children}
      </AdminShell>
    </div>
  );
}
