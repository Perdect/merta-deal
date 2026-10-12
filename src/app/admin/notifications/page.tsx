import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getAdminNotifications, getRecentBroadcasts } from "@/lib/data/admin";
import { toBroadcastLog } from "@/lib/data/admin-care";
import { AdminNotificationList, BroadcastForm } from "@/components/admin/notifications-admin";
import { AdminPageHeader, Panel, EmptyBlock, ErrorBlock } from "@/components/admin/kit";
import { formatDateTime, formatNumber, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

const LIMIT = 60;
const AUDIENCE_LABEL: Record<string, string> = { customers: "All customers", stores: "All stores", riders: "All riders", all: "Everyone", user: "One user" };

export default async function AdminNotificationsPage() {
  const [user, { items }, raw] = await Promise.all([getSessionUser(), getAdminNotifications(LIMIT), getRecentBroadcasts()]);
  const broadcasts = raw.map(toBroadcastLog);
  return (
    <>
      <AdminPageHeader title="Notifications" description="Your inbox, and broadcasts to customers, stores and riders." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        {user ? <AdminNotificationList userId={user.id} initial={items} limit={LIMIT} /> : <ErrorBlock title="Couldn't load your inbox" description="Your session could not be read. Sign in again if this keeps happening." retryHref="/admin/notifications" />}
        <div className="space-y-4">
          <BroadcastForm />
          <Panel title="Recent broadcasts" description="Last 10, from the audit log" flush>
            {broadcasts.length === 0 ? <EmptyBlock icon={Megaphone} title="No broadcasts sent yet" description="Broadcasts you send appear here with their reach." /> : (
              <ul className="divide-y divide-line border-t border-line">
                {broadcasts.map((b) => (
                  <li key={b.id} className="px-4 py-2.5 sm:px-5">
                    <p className="truncate text-sm font-medium text-ink">{b.title || "Untitled"}</p>
                    <p className="text-xs text-ink-3">
                      {b.audience === "user" ? b.email ?? "One user" : AUDIENCE_LABEL[b.audience] ?? b.audience}
                      {b.recipients != null ? ` · ${formatNumber(b.recipients)} ${b.recipients === 1 ? "recipient" : "recipients"}` : ""}
                      {" · "}<span title={formatDateTime(b.created_at)}>{timeAgo(b.created_at)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
