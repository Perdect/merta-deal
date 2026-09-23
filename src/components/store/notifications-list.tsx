"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { useNotifications, notificationHref } from "@/hooks/use-notifications";
import { markStoreNotificationsReadAction } from "@/lib/actions/store";
import type { Notification } from "@/types/app";
import { cn, timeAgo } from "@/lib/utils";

/** Store inbox: live list (Realtime) with mark-read per item and for all. */
export function StoreNotifications({ userId, initial, unread: initialUnread }: { userId: string; initial: Notification[]; unread: number }) {
  const router = useRouter();
  const { items, unread, setItems } = useNotifications(userId, initial, { toastNew: false });
  const [busy, setBusy] = React.useState(false);
  const markAll = async () => {
    setBusy(true);
    const r = await markStoreNotificationsReadAction();
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setItems((cur) => cur.map((n) => ({ ...n, is_read: true }))); router.refresh();
  };
  const open = async (n: Notification) => {
    if (!n.is_read) { setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))); await markStoreNotificationsReadAction([n.id]); }
    router.push(notificationHref(n, "store"));
  };
  const total = items.some((i) => !i.is_read) ? Math.max(unread, initialUnread) : 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><p className="text-sm text-ink-3">{total > 0 ? `${total} unread` : "All caught up"}</p><Button variant="ghost" size="sm" loading={busy} disabled={total === 0} onClick={markAll}><CheckCheck className="h-4 w-4" /> Mark all read</Button></div>
      {items.length === 0 ? <EmptyState icon={<Bell className="h-7 w-7" />} title="No notifications" description="New orders, payment updates and low-stock alerts arrive here." /> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-card">
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => open(n)} className={cn("flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-surface sm:px-4", !n.is_read && "bg-brand-50/40")}>
                <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-brand-600")} />
                <span className="min-w-0 flex-1"><span className={cn("block text-sm", n.is_read ? "font-medium text-ink-2" : "font-semibold text-ink")}>{n.title}</span><span className="block text-xs text-ink-3">{n.body}</span></span>
                <span className="shrink-0 text-[11px] text-ink-4">{timeAgo(n.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-xs text-ink-4">Showing the latest {items.length}. <Link href="/store" className="font-semibold text-brand-700">Back to dashboard</Link></p>
    </div>
  );
}
