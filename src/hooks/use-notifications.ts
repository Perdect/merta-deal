"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/types/app";
import { toast } from "@/components/ui/toast";

/** Live in-app notifications for the signed-in user (Supabase Realtime on `notifications`). */
export function useNotifications(userId: string | null, initial: Notification[] = [], opts: { toastNew?: boolean } = { toastNew: true }) {
  const [items, setItems] = React.useState<Notification[]>(initial);
  const [seen, setSeen] = React.useState(initial);
  if (seen !== initial) { setSeen(initial); setItems(initial); }
  React.useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const ch = supabase.channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as Notification;
        setItems((cur) => [n, ...cur].slice(0, 100));
        if (opts.toastNew) toast.custom({ title: n.title, description: n.body, tone: n.type.includes("cancel") || n.type === "low_stock" ? "warning" : "info", action: (n.data as { order_id?: string })?.order_id ? { label: "View", onClick: () => { window.location.href = notificationHref(n); } } : undefined });
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(60);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as Notification; setItems((cur) => cur.map((x) => (x.id === n.id ? n : x)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, opts.toastNew]);
  const unread = items.filter((i) => !i.is_read).length;
  return { items, unread, setItems };
}

/** Where a notification should take the user, based on its type and role context. */
export function notificationHref(n: Notification, role: "customer" | "store" | "rider" | "admin" = "customer") {
  const d = (n.data ?? {}) as { order_id?: string; assignment_id?: string; inventory_id?: string };
  if (role === "store") return d.order_id ? `/store/orders/${d.order_id}` : d.inventory_id ? "/store/inventory" : "/store";
  if (role === "rider") return d.assignment_id || d.order_id ? "/rider" : "/rider";
  if (role === "admin") return d.order_id ? `/admin/orders/${d.order_id}` : "/admin";
  return d.order_id ? `/orders/${d.order_id}` : "/account/notifications";
}
