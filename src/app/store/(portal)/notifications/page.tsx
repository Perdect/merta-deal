import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyStore } from "@/lib/data/store";
import { getMyNotifications } from "@/lib/data/account";
import { StoreNotifications } from "@/components/store/notifications-list";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function StoreNotificationsPage() {
  const [user, membership] = await Promise.all([getSessionUser(), getMyStore()]);
  if (!user) redirect("/login?next=/store/notifications");
  if (!membership) redirect("/store/register");
  const { items, unread } = await getMyNotifications(50);
  return (
    <div>
      <PageHeader title="Notifications" className="px-0" />
      <StoreNotifications userId={user.id} initial={items} unread={unread} />
    </div>
  );
}
