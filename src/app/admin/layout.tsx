import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getAdminNotifications } from "@/lib/data/admin";
import { DashboardShell } from "@/components/shared/dashboard-shell";
import { adminNav } from "@/config/site";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin | Merta Deal" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Admin frame. proxy.ts already gates /admin by role; this re-checks server-side so a stale cookie can never render admin data. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin" && user.role !== "super_admin") redirect("/");
  const { unread } = await getAdminNotifications(1);
  return (
    <DashboardShell nav={adminNav} title="Admin" accent="ink" user={{ name: user.fullName ?? user.email, role: user.role, avatarUrl: user.avatarUrl }} notificationsHref="/admin/notifications" unread={unread} mobileTabs>
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </DashboardShell>
  );
}
