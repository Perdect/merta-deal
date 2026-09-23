import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { emailProvider } from "./providers/email";
import { pushProvider } from "./providers/push";
import { smsProvider } from "./providers/sms";
import { whatsappProvider } from "./providers/whatsapp";
import type { NotificationChannel, NotificationPayload, NotificationProvider, SendResult } from "./types";

export const providers: Record<Exclude<NotificationChannel, "in_app">, NotificationProvider> = {
  push: pushProvider,
  whatsapp: whatsappProvider,
  sms: smsProvider,
  email: emailProvider,
};

export type DispatchInput = NotificationPayload & { channels: NotificationChannel[] };
export type DispatchResult = { results: Partial<Record<NotificationChannel, SendResult>>; notificationId: string | null };

/** What each channel needs, for /setup-style status screens. */
export function channelStatus() {
  return (Object.values(providers) as NotificationProvider[]).map((p) => ({ channel: p.channel, configured: p.isConfigured() }));
}

/**
 * Fans a notification out to every requested channel.
 * - `in_app`: inserts a `notifications` row with the service-role client (Realtime delivers it to the user's open tabs).
 *   If `push` is also requested, the row's `sent_push` reflects whether push went out in this call, so the
 *   cron in /api/cron/notifications only retries what actually failed.
 * - `push` / `whatsapp` / `sms` / `email`: delegated to providers; each returns the transport's real outcome.
 * Never throws for a provider failure — inspect `results` per channel.
 */
export async function dispatchNotification(input: DispatchInput): Promise<DispatchResult> {
  const channels = Array.from(new Set(input.channels));
  const payload: NotificationPayload = { userId: input.userId, title: input.title, body: input.body, url: input.url ?? null, data: input.data ?? {}, type: input.type ?? "general" };
  const results: DispatchResult["results"] = {};

  const external = channels.filter((c): c is Exclude<NotificationChannel, "in_app"> => c !== "in_app");
  const settled = await Promise.allSettled(external.map((c) => providers[c].send(payload)));
  settled.forEach((s, i) => {
    const c = external[i]!;
    results[c] = s.status === "fulfilled" ? s.value : { sent: false, reason: "error", detail: s.reason instanceof Error ? s.reason.message : String(s.reason) };
  });

  let notificationId: string | null = null;
  if (channels.includes("in_app")) {
    const admin = createAdminClient();
    if (!admin) {
      results.in_app = { sent: false, reason: "not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY missing — in-app rows are normally created by DB triggers; server-side inserts need the service role.", envVars: ["SUPABASE_SERVICE_ROLE_KEY"] };
    } else {
      const pushRequested = channels.includes("push");
      const pushDone = pushRequested && Boolean(results.push?.sent || results.push?.reason === "no_recipient");
      const { data, error } = await admin.from("notifications").insert({
        user_id: payload.userId, type: payload.type ?? "general", title: payload.title, body: payload.body,
        data: { ...(payload.data ?? {}), url: payload.url ?? null } as Json, channels, sent_push: pushRequested ? pushDone : true,
      }).select("id").single();
      if (error) results.in_app = { sent: false, reason: "error", detail: error.message };
      else { notificationId = data.id; results.in_app = { sent: true, count: 1 }; }
    }
  }
  return { results, notificationId };
}
