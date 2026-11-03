"use client";
import * as React from "react";
import Link from "next/link";
import { BellRing, Info } from "lucide-react";
import { usePushSubscription } from "@/hooks/use-notifications";
import { Switch } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

/**
 * Web-push opt-in for this device. The browser's permission dialog opens only when the customer
 * flips the switch (never on page load). Renders an honest setup note when VAPID keys are missing,
 * and a plain explanation when the browser can't do push (Safari on iPhone before Add to Home Screen).
 */
export function PushToggle({ configured, vapidPublicKey }: { configured: boolean; vapidPublicKey: string }) {
  const push = usePushSubscription({ configured, vapidPublicKey });
  const blocked = push.permission === "denied";

  const toggle = async (next: boolean) => {
    if (push.busy) return;
    if (next) {
      const r = await push.enable();
      if (r.ok) toast.success("Push notifications on", "You'll get order updates even when the app is closed.");
      else toast.error(r.permission === "granted" ? "Could not turn on push notifications" : "Notifications not turned on", r.error);
    } else {
      const r = await push.disable();
      if (r.ok) toast.info("Push notifications off"); else toast.error("Could not turn off push notifications", r.error);
    }
  };

  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card" aria-labelledby="push-title">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700" aria-hidden="true"><BellRing className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="push-title" className="text-base font-bold text-ink">Push notifications</h2>
          <p className="mt-0.5 text-sm text-ink-3">Get order status and rider updates on this device, even when Merta Deal is closed.</p>
        </div>
        {push.available ? <Switch checked={push.enabled} onChange={toggle} disabled={push.busy || blocked} label={push.busy ? "Please wait" : push.enabled ? "On" : "Off"} /> : null}
      </div>
      {push.permission === "unconfigured" ? (
        <Alert tone="warning" className="mt-3" icon={<Info className="h-4 w-4" />}>Push notifications need VAPID keys (<code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> and <code>VAPID_PRIVATE_KEY</code>). See <Link href="/setup" className="font-semibold underline">/setup</Link>. In-app notifications above still work.</Alert>
      ) : push.permission === "unsupported" ? (
        <Alert tone="neutral" className="mt-3">This browser doesn&apos;t support web push. On iPhone, add Merta Deal to your Home Screen first, then enable it from here.</Alert>
      ) : blocked ? (
        <Alert tone="warning" className="mt-3">Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload this page.</Alert>
      ) : push.available && !push.enabled ? (
        <p className="mt-3 text-xs text-ink-3">Turning this on opens your browser&apos;s permission prompt. You can switch it off here any time.</p>
      ) : null}
    </section>
  );
}
