"use client";
import * as React from "react";
import Link from "next/link";
import { BellRing, Info } from "lucide-react";
import { savePushSubscriptionAction, removePushSubscriptionAction } from "@/lib/actions/account";
import { Switch } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Web-push opt-in: registers /sw.js, subscribes with the VAPID public key and stores the subscription.
 * Renders an honest setup note when VAPID keys are missing.
 */
const subscribeNoop = () => () => {};
const readSupport = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const readSupportServer = () => null;

export function PushToggle({ configured, vapidPublicKey }: { configured: boolean; vapidPublicKey: string }) {
  // null during SSR/hydration, then the real capability check on the client.
  const supported = React.useSyncExternalStore<boolean | null>(subscribeNoop, readSupport, readSupportServer);
  const [enabled, setEnabled] = React.useState(false);
  const [blocked, setBlocked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!configured || !supported) return;
    let cancelled = false;
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (cancelled) return;
      setEnabled(Boolean(sub));
      setBlocked(Notification.permission === "denied");
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [configured, supported]);

  const enable = async () => {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { setBlocked(perm === "denied"); toast.error("Notifications are blocked", "Allow notifications for this site in your browser settings, then try again."); return; }
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Browser returned an incomplete push subscription");
    const r = await savePushSubscriptionAction({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }, navigator.userAgent);
    if (!r.ok) { await sub.unsubscribe().catch(() => {}); throw new Error(r.error); }
    setEnabled(true); toast.success("Push notifications on", "You'll get order updates even when the app is closed.");
  };

  const disable = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { const r = await removePushSubscriptionAction(sub.endpoint); if (!r.ok) throw new Error(r.error); await sub.unsubscribe(); }
    setEnabled(false); toast.info("Push notifications off");
  };

  const toggle = async (next: boolean) => {
    setBusy(true);
    try { if (next) await enable(); else await disable(); }
    catch (e) { toast.error("Could not update push notifications", e instanceof Error ? e.message : undefined); }
    setBusy(false);
  };

  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><BellRing className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-ink">Push notifications</h2>
          <p className="mt-0.5 text-sm text-ink-3">Get order status and rider updates on this device, even when Merta Deal is closed.</p>
        </div>
        {configured && supported ? <Switch checked={enabled} onChange={toggle} disabled={busy || blocked} label={enabled ? "On" : "Off"} /> : null}
      </div>
      {!configured ? (
        <Alert tone="warning" className="mt-3" icon={<Info className="h-4 w-4" />}>Push notifications need VAPID keys (<code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> and <code>VAPID_PRIVATE_KEY</code>). See <Link href="/setup" className="font-semibold underline">/setup</Link>. In-app notifications above still work.</Alert>
      ) : supported === false ? (
        <Alert tone="neutral" className="mt-3">This browser doesn&apos;t support web push. On iPhone, add Merta Deal to your Home Screen first, then enable it from here.</Alert>
      ) : blocked ? (
        <Alert tone="warning" className="mt-3">Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload this page.</Alert>
      ) : null}
    </section>
  );
}
