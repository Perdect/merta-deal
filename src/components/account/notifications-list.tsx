"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck, Package, XCircle, Tag, Wallet, Truck, Star } from "lucide-react";
import type { Notification } from "@/types/app";
import { useNotifications, notificationHref } from "@/hooks/use-notifications";
import { markNotificationsReadAction } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { cn, timeAgo } from "@/lib/utils";
import { audienceOf, AUDIENCE_LABEL } from "@/lib/alerts/audience";

function iconFor(type: string) {
  if (type.includes("cancel") || type.includes("reject")) return <XCircle className="h-4.5 w-4.5 text-danger" />;
  if (type.includes("deliver") || type.includes("pickup") || type.includes("rider")) return <Truck className="h-4.5 w-4.5 text-info" />;
  if (type.includes("order")) return <Package className="h-4.5 w-4.5 text-brand-700" />;
  if (type.includes("wallet") || type.includes("refund") || type.includes("cashback")) return <Wallet className="h-4.5 w-4.5 text-brand-700" />;
  if (type.includes("promo") || type.includes("offer") || type.includes("coupon")) return <Tag className="h-4.5 w-4.5 text-saffron-700" />;
  if (type.includes("review") || type.includes("rating")) return <Star className="h-4.5 w-4.5 text-saffron-700" />;
  return <Bell className="h-4.5 w-4.5 text-ink-3" />;
}

/** Realtime notification inbox: unread styling, mark-all-read, tap to open the related page. */
export function NotificationsList({ userId, initial }: { userId: string; initial: Notification[] }) {
  const router = useRouter();
  const { items, unread, setItems } = useNotifications(userId, initial, { toastNew: false });
  const [busy, setBusy] = React.useState(false);

  const markAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await markNotificationsReadAction();
      if (!r.ok) { toast.error(r.error); return; }
      setItems((cur) => cur.map((n) => ({ ...n, is_read: true })));
    } catch {
      toast.error("Could not mark notifications as read", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const open = (n: Notification) => {
    if (!n.is_read) { setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))); void markNotificationsReadAction([n.id]); }
    const aud = audienceOf(n.type, "customer");
    router.push(notificationHref(n, aud));
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-3" role="status" aria-live="polite">{unread > 0 ? `${unread} unread` : "You're all caught up"}</p>
        <Button variant="ghost" size="md" className="px-3" onClick={markAll} loading={busy} disabled={busy || unread === 0}><CheckCheck className="h-4 w-4" aria-hidden /> Mark all read</Button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<BellOff className="h-7 w-7" />} title="No notifications yet" description="Order updates, offers and wallet credits will show up here." compact />
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line bg-card shadow-card divide-y divide-line">
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => open(n)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-600", !n.is_read && "bg-brand-50/50")}>
                <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", n.is_read ? "bg-surface-2" : "bg-card shadow-card")} aria-hidden="true">{iconFor(n.type)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={cn("text-sm text-ink", n.is_read ? "font-medium" : "font-bold")}>{!n.is_read ? <span className="sr-only">Unread: </span> : null}{n.title}{audienceOf(n.type, "customer") !== "customer" ? <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-ink-3">{AUDIENCE_LABEL[audienceOf(n.type, "customer")]}</span> : null}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">{timeAgo(n.created_at)}</span>
                  </span>
                  <span className={cn("mt-0.5 block text-sm", n.is_read ? "text-ink-3" : "text-ink-2")}>{n.body}</span>
                </span>
                {!n.is_read ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-hidden="true" /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
