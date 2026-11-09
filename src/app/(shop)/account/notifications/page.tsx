import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyNotifications } from "@/lib/data/account";
import { env, isPushConfigured } from "@/lib/env";
import { NotificationsList } from "@/components/account/notifications-list";
import { PushToggle } from "@/components/account/push-toggle";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) return null; // the account layout shows the login prompt
  const { items } = await getMyNotifications(50);
  return (
    <div className="pt-1">
      <PageHeader title="Notifications" back="/account" />
      <div className="space-y-5 px-4 sm:px-0">
        <NotificationsList userId={user.id} initial={items} />
        <PushToggle configured={isPushConfigured()} vapidPublicKey={env.vapidPublicKey} />
      </div>
    </div>
  );
}
