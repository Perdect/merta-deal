import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyStore } from "@/lib/data/store";
import { getMyNotifications } from "@/lib/data/account";
import { StoreShell } from "@/components/store/store-shell";

export const dynamic = "force-dynamic";

export default async function StorePortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/store");
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  const { store, role } = membership;
  const notifications = await getMyNotifications(20);
  return (
    <StoreShell store={{ id: store.id, name: store.name, status: store.status, is_open: store.is_open, logo_url: store.logo_url }} role={role} user={{ id: user.id, name: user.fullName, role: user.role, avatarUrl: user.avatarUrl }} unread={notifications.unread} notifications={notifications.items}>
      {children}
    </StoreShell>
  );
}
