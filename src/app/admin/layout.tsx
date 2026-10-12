import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getAdminNotifications } from "@/lib/data/admin";
import { AdminShell } from "@/components/admin/kit/shell";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin | Merta Deal" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Admin frame. proxy.ts already gates /admin by role; this re-checks server-side so a stale cookie can never render admin data. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin" && user.role !== "super_admin") redirect("/");
  const { unread } = await getAdminNotifications(1);
  return (
    <AdminShell user={{ name: user.fullName, email: user.email, role: user.role, avatarUrl: user.avatarUrl }} unread={unread}>
      {children}
    </AdminShell>
  );
}
