"use client";
import * as React from "react";
import { BellRing, X } from "lucide-react";
import { usePushSubscription } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

const DISMISS_KEY = "md_push_card_dismissed";
const DISMISS_FOR_MS = 14 * 86400 * 1000;
const subscribeNoop = () => () => {};
function readDismissed() {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < DISMISS_FOR_MS; } catch { return false; }
}

/**
 * One-time offer to turn on push, shown right after an order is placed — the moment it is useful.
 * Only renders when the browser supports push, the server has VAPID keys and the customer has never
 * answered the permission prompt. The prompt opens from the button only. "Not now" hides it for two
 * weeks on this device; the switch on /account/notifications remains available.
 */
export function PushOptInCard({ configured, vapidPublicKey }: { configured: boolean; vapidPublicKey: string }) {
  const push = usePushSubscription({ configured, vapidPublicKey });
  // The stored dismissal is browser state (localStorage may be unavailable in private mode); the
  // server snapshot is "dismissed" so nothing flashes before hydration.
  const storedDismissed = React.useSyncExternalStore(subscribeNoop, readDismissed, () => true);
  const [done, setDone] = React.useState(false);

  if (storedDismissed || done || !push.available || push.enabled || push.permission !== "default") return null;

  const notNow = () => { setDone(true); try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {} };
  const turnOn = async () => {
    const r = await push.enable();
    if (r.ok) { setDone(true); toast.success("Notifications on", "We'll tell you when your order is packed, on the way and delivered."); }
    else { toast.error("Notifications not turned on", r.error); if (r.permission === "denied") setDone(true); }
  };

  return (
    <section className="flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 p-4" aria-labelledby="push-card-title">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-brand-700 shadow-card" aria-hidden="true"><BellRing className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <h2 id="push-card-title" className="text-sm font-bold text-ink">Get updates on this order</h2>
        <p className="mt-0.5 text-sm text-ink-2">We can notify you when it&apos;s packed, on the way and delivered — even with the app closed. Your browser will ask for permission.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={turnOn} loading={push.busy}><BellRing className="h-4 w-4" /> Turn on notifications</Button>
          <Button size="sm" variant="ghost" onClick={notNow} disabled={push.busy}>Not now</Button>
        </div>
      </div>
      <button type="button" onClick={notNow} aria-label="Dismiss" className="tap -mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-card hover:text-ink"><X className="h-4 w-4" aria-hidden /></button>
    </section>
  );
}
