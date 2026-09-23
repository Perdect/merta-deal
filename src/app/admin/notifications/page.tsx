import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getAdminNotifications, getRecentBroadcasts } from "@/lib/data/admin";
import { AdminNotificationList, BroadcastForm } from "@/components/admin/notifications-admin";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

export default async function AdminNotificationsPage() {
  const [user, { items }, broadcasts] = await Promise.all([getSessionUser(), getAdminNotifications(60), getRecentBroadcasts()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Notifications" subtitle="Your inbox, plus broadcasts to customers, stores and riders." className="px-0" />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <AdminNotificationList userId={user!.id} initial={items} />
        <div className="space-y-4">
          <BroadcastForm />
          <Card>
            <CardHeader title="Recent broadcasts" />
            <CardBody>
              {broadcasts.length === 0 ? <p className="text-sm text-ink-3">No broadcasts sent yet.</p> : (
                <ul className="divide-y divide-line text-sm">{broadcasts.map((b) => { const d = (b.after_data ?? {}) as { audience?: string; title?: string; recipients?: number; email?: string | null }; return <li key={b.id} className="py-2"><p className="font-semibold text-ink">{d.title}</p><p className="text-xs text-ink-3">{d.audience === "user" ? d.email : d.audience} · {d.recipients} recipients · {formatDateTime(b.created_at)}</p></li>; })}</ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
