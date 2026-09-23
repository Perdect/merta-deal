import "server-only";
import webpush, { WebPushError } from "web-push";
import { env, serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationPayload, NotificationProvider, SendResult } from "../types";

const ENV_VARS = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "SUPABASE_SERVICE_ROLE_KEY"];

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return true;
  const { vapidPrivateKey, vapidSubject } = serverEnv();
  if (!env.vapidPublicKey || !vapidPrivateKey) return false;
  webpush.setVapidDetails(vapidSubject, env.vapidPublicKey, vapidPrivateKey);
  vapidReady = true;
  return true;
}

/**
 * Web Push via VAPID. Reads the user's `push_subscriptions` with the service-role client
 * (the cron has no user session) and prunes subscriptions the push service reports as gone (404/410).
 */
export const pushProvider: NotificationProvider = {
  channel: "push",
  isConfigured() {
    const s = serverEnv();
    return Boolean(env.vapidPublicKey && s.vapidPrivateKey && s.serviceRoleKey && env.supabaseUrl);
  },
  async send(payload: NotificationPayload): Promise<SendResult> {
    if (!ensureVapid()) return { sent: false, reason: "not_configured", detail: "VAPID keys missing — run `pnpm push:keys`.", envVars: ENV_VARS };
    const admin = createAdminClient();
    if (!admin) return { sent: false, reason: "not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY missing.", envVars: ENV_VARS };
    const { data: subs, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", payload.userId);
    if (error) return { sent: false, reason: "error", detail: error.message };
    if (!subs?.length) return { sent: false, reason: "no_recipient", detail: "User has no push subscriptions." };

    const message = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? "/account/notifications", data: payload.data ?? {}, type: payload.type ?? "general" });
    let count = 0; const dead: string[] = []; const errors: string[] = [];
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 60 * 60, urgency: "high" });
        count++;
      } catch (err) {
        if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) dead.push(s.id);
        else errors.push(err instanceof WebPushError ? `${err.statusCode}: ${err.body?.slice(0, 120)}` : err instanceof Error ? err.message : String(err));
      }
    }));
    if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
    if (count > 0) return { sent: true, count, detail: [dead.length ? `${dead.length} expired subscription(s) removed` : null, errors.length ? `${errors.length} failed: ${errors[0]}` : null].filter(Boolean).join("; ") || undefined };
    if (dead.length && !errors.length) return { sent: false, reason: "no_recipient", detail: `All ${dead.length} subscription(s) had expired and were removed.` };
    return { sent: false, reason: "error", detail: errors[0] ?? "Push service rejected the message." };
  },
};
