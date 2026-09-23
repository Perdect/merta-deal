"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock, ShieldAlert, Store as StoreIcon } from "lucide-react";
import { DashboardShell } from "@/components/shared/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/states";
import { useNotifications, notificationHref } from "@/hooks/use-notifications";
import { toast } from "@/components/ui/toast";
import { storeNav } from "@/config/site";
import { STORE_STATUS_META } from "./constants";
import type { Notification, Store } from "@/types/app";
import type { StoreRole } from "@/lib/data/store";

export type ShellStore = Pick<Store, "id" | "name" | "status" | "is_open" | "logo_url">;

/**
 * Merchant portal frame: DashboardShell + store status banner + live notification badge/toasts.
 * New-order notifications also refresh the current server view so lists and KPIs stay current.
 */
export function StoreShell({ store, role, user, unread, notifications, children }: { store: ShellStore; role: StoreRole; user: { id: string; name: string | null; role: string; avatarUrl?: string | null }; unread: number; notifications: Notification[]; children: React.ReactNode }) {
  const router = useRouter();
  // Toasts are raised here (not by the hook) so "View" opens the store-side order page.
  const live = useNotifications(user.id, notifications, { toastNew: false });
  const seen = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    if (!seen.current) { seen.current = new Set(notifications.map((n) => n.id)); }
    const fresh = live.items.filter((n) => !seen.current!.has(n.id));
    if (!fresh.length) return;
    fresh.forEach((n) => {
      seen.current!.add(n.id);
      const href = notificationHref(n, "store");
      toast.custom({ title: n.title, description: n.body, tone: n.type === "new_order" ? "success" : n.type.includes("cancel") || n.type === "low_stock" ? "warning" : "info", action: { label: "View", onClick: () => router.push(href) } });
    });
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(80);
    router.refresh();
  }, [live.items, notifications, router]);

  const meta = STORE_STATUS_META[store.status];
  const badge = (
    <span className="flex items-center gap-2">
      <Badge tone={meta.tone}>{meta.label}</Badge>
      <span className={store.is_open ? "inline-flex items-center gap-1 text-xs font-semibold text-success" : "inline-flex items-center gap-1 text-xs font-semibold text-ink-3"}><span className={store.is_open ? "h-2 w-2 rounded-full bg-success" : "h-2 w-2 rounded-full bg-line-2"} />{store.is_open ? "Open" : "Closed"}</span>
    </span>
  );

  return (
    <DashboardShell nav={storeNav} title="Store" badge={badge} user={{ name: user.name, role: role === "owner" ? "store owner" : `store ${role}`, avatarUrl: user.avatarUrl }} notificationsHref="/store/notifications" unread={Math.max(unread, live.unread)}>
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="flex items-center gap-2 lg:hidden"><StoreIcon className="h-4 w-4 text-brand-600" /><p className="truncate text-sm font-bold text-ink">{store.name}</p>{badge}</div>
        {store.status === "pending" ? (
          <Alert tone="warning" icon={<Clock className="h-4 w-4" />} title="Awaiting admin approval">Your store is being verified. You can set up products, stock and your profile now; customers will see the store and orders will start once an admin approves it.</Alert>
        ) : store.status === "suspended" ? (
          <Alert tone="danger" icon={<ShieldAlert className="h-4 w-4" />} title="Store suspended">Ordering is paused for this store. Please contact Merta Deal support to resolve this.</Alert>
        ) : store.status === "closed" ? (
          <Alert tone="neutral" title="Store closed">This store has been closed by the platform. Contact support if this is unexpected.</Alert>
        ) : null}
        {children}
      </div>
    </DashboardShell>
  );
}
