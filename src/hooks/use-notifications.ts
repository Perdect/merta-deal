"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/types/app";
import { toast } from "@/components/ui/toast";
import { realtimeTopic } from "@/lib/realtime-topic";
import { savePushSubscriptionAction, removePushSubscriptionAction } from "@/lib/actions/account";

/** Live in-app notifications for the signed-in user (Supabase Realtime on `notifications`). */
export function useNotifications(userId: string | null, initial: Notification[] = [], opts: { toastNew?: boolean } = { toastNew: true }) {
  const [items, setItems] = React.useState<Notification[]>(initial);
  const [seen, setSeen] = React.useState(initial);
  if (seen !== initial) { setSeen(initial); setItems(initial); }
  React.useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const ch = supabase.channel(realtimeTopic(`notifications:${userId}`))
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
export function notificationHref(n: Notification, role: "customer" | "rider" | "admin" = "customer") {
  const d = (n.data ?? {}) as { order_id?: string; assignment_id?: string; inventory_id?: string };
  if (role === "rider") return d.assignment_id || d.order_id ? "/rider" : "/rider";
  if (role === "admin") return d.order_id ? `/admin/orders/${d.order_id}` : d.inventory_id ? "/admin/products?stock=low_stock" : "/admin";
  return d.order_id ? `/orders/${d.order_id}` : "/account/notifications";
}

/* ------------------------------------------------------------------ web push */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const subscribeNoop = () => () => {};
const readSupport = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const readSupportServer = () => null;

export type PushPermission = NotificationPermission | "unsupported" | "unconfigured" | null;

/**
 * Web-push opt-in state and actions for one device. The browser permission dialog is only ever
 * opened from `enable()`, i.e. from an explicit tap on a button the customer can read first — never
 * on page load. `supported` is null during SSR/hydration, then the real capability check.
 *
 * - `available`: this browser can do push AND the server has a VAPID key, so offering it is honest.
 * - `permission`: "default" (never asked) | "granted" | "denied" | "unsupported" | "unconfigured".
 * - `enabled`: a subscription exists on this device.
 */
export function usePushSubscription({ configured, vapidPublicKey }: { configured: boolean; vapidPublicKey: string }) {
  const supported = React.useSyncExternalStore<boolean | null>(subscribeNoop, readSupport, readSupportServer);
  const [enabled, setEnabled] = React.useState(false);
  const [permission, setPermission] = React.useState<NotificationPermission | null>(null);
  const [busy, setBusy] = React.useState(false);
  const available = Boolean(configured && supported && vapidPublicKey);

  React.useEffect(() => {
    if (!available) return;
    let cancelled = false;
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (cancelled) return;
      setEnabled(Boolean(sub));
      setPermission(Notification.permission);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [available]);

  /** Asks the browser for permission (user gesture required), subscribes and stores the subscription. */
  const enable = React.useCallback(async (): Promise<{ ok: true } | { ok: false; error: string; permission: NotificationPermission }> => {
    if (!available) return { ok: false, error: "Push notifications are not available here.", permission: "default" };
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        return { ok: false, permission: perm, error: perm === "denied" ? "Notifications are blocked for this site. Allow them in your browser's site settings, then try again." : "Notifications were not turned on. Tap the button again to allow them." };
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Browser returned an incomplete push subscription");
      const r = await savePushSubscriptionAction({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }, navigator.userAgent);
      if (!r.ok) { await sub.unsubscribe().catch(() => {}); throw new Error(r.error); }
      setEnabled(true);
      return { ok: true };
    } catch (e) {
      return { ok: false, permission: Notification.permission, error: e instanceof Error ? e.message : "Could not turn on push notifications" };
    } finally {
      setBusy(false);
    }
  }, [available, vapidPublicKey]);

  /** Removes this device's subscription (server first, then the browser). */
  const disable = React.useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { const r = await removePushSubscriptionAction(sub.endpoint); if (!r.ok) throw new Error(r.error); await sub.unsubscribe(); }
      setEnabled(false);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not turn off push notifications" };
    } finally {
      setBusy(false);
    }
  }, []);

  const state: PushPermission = !configured ? "unconfigured" : supported === null ? null : supported === false ? "unsupported" : permission;
  return { supported, available, enabled, busy, permission: state, enable, disable };
}
