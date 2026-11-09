import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getAdminNotifications } from "@/lib/data/admin";
import { getLiveCounts } from "@/lib/data/admin-dashboard";
import { AdminShell } from "@/components/admin/kit/shell";
import { PortalTheme } from "@/components/shared/portal-theme";
import { createClient } from "@/lib/supabase/server";
import { env, isPushConfigured } from "@/lib/env";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin | Merta Deal" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Admin frame (blue theme). proxy.ts already gates /admin; this re-checks on the server — role, active
 * account, and the database's own is_admin() — so a stale cookie or a deactivated admin never renders
 * admin data. Every admin server action and admin RPC checks again.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin || (user.role !== "admin" && user.role !== "super_admin")) redirect("/admin/login?denied=1");
  const [{ unread }, live] = await Promise.all([getAdminNotifications(1), getLiveCounts().catch(() => null)]);
  return (
    <div className="theme-admin contents">
      <PortalTheme portal="admin" />
      <AdminShell user={{ name: user.fullName, email: user.email, role: user.role, avatarUrl: user.avatarUrl }} userId={user.id} unread={unread} counts={live?.badges ?? null} push={{ configured: isPushConfigured(), vapidPublicKey: env.vapidPublicKey }}>
        {children}
      </AdminShell>
    </div>
  );
}
