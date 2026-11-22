import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { indianMobile, riderAlertSmsConfig, riderAlertSmsMissing, sendRiderAlertSms } from "@/lib/sms/otp-sms";
import { pushProvider } from "./providers/push";
import { emptyRiderSummary, runRiderAlerts, type ChannelOutcome, type RiderAlertChannel, type RiderAlertClaim, type RiderAlertPorts, type RiderAlertSummary } from "./rider-alerts-core";

export { RIDER_ALERT_TYPES, type RiderAlertSummary } from "./rider-alerts-core";

type RpcError = { code?: string; message: string };
/** The 0058 functions are missing: the migration has not been applied to this database yet. */
const notMigrated = (e: RpcError | null) => Boolean(e && (e.code === "PGRST202" || e.code === "42883" || /rider_alert_(queue|claim|record)/.test(e.message) && /find|exist/i.test(e.message)));

/** Whether rider SMS alerts can be sent at all from this server, and what is missing when they cannot (env var names only). */
export function riderSmsStatus(): { configured: boolean; missing: string[] } {
  const missing = riderAlertSmsMissing();
  return { configured: missing.length === 0, missing };
}

/**
 * Sends rider alerts (delivery requests and "no longer yours" notices) that are still waiting, by push
 * and, for requests, by SMS. Every send is claimed in the database first (`rider_alert_claim`), which
 * re-checks that the delivery is still this rider's at that moment and refuses a second send of the same
 * event, so this is safe to call from the scheduler, from server actions and from open staff apps at once.
 * Returns `reason: "not_migrated"` when migration 0058 is not applied; the caller then leaves rider rows to
 * the older push sweep, as before.
 */
export async function deliverRiderAlerts(opts: { orderId?: string; limit?: number } = {}): Promise<RiderAlertSummary> {
  const admin = createAdminClient();
  if (!admin) return { ...emptyRiderSummary(), ok: false, reason: "not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY missing" };
  const sms = riderAlertSmsConfig();

  const ports: RiderAlertPorts = {
    async queue(limit, orderId) {
      const { data, error } = await admin.rpc("rider_alert_queue" as never, { p_limit: limit, p_order_id: orderId } as never);
      if (error) throw Object.assign(new Error((error as RpcError).message), { rpc: error as RpcError });
      return (data ?? []) as unknown as { id: string; type: string }[];
    },
    async claim(notificationId, channel) {
      const { data, error } = await admin.rpc("rider_alert_claim" as never, { p_notification_id: notificationId, p_channel: channel } as never);
      // A claim that could not be read is not a grant: nothing is sent.
      if (error || !data) return { send: false, reason: "claim_failed" };
      return data as unknown as RiderAlertClaim;
    },
    async record(notificationId, channel, status, providerId, err, eventKey) {
      await admin.rpc("rider_alert_record" as never, { p_notification_id: notificationId, p_channel: channel, p_status: status, p_provider_id: providerId, p_error: err, p_event_key: eventKey } as never);
    },
    channels: {
      push: {
        configured: () => pushProvider.isConfigured(),
        unavailableReason: () => "Web Push is not configured on the server (VAPID keys).",
        async send(grant, message): Promise<ChannelOutcome> {
          const res = await pushProvider.send({ userId: grant.user_id, title: message.title, body: message.body, url: message.url, type: message.type, data: message.data, tag: message.tag, sticky: message.sticky, ttlSeconds: message.ttlSeconds });
          if (res.sent) return { status: "sent", providerId: `${res.count} device${res.count === 1 ? "" : "s"}` };
          if (res.reason === "no_recipient") return { status: "no_recipient", detail: res.detail ?? "The rider has not enabled push on any device." };
          if (res.reason === "not_configured") return { status: "unavailable", detail: res.detail ?? "Web Push is not configured on the server." };
          return { status: "failed", detail: res.detail ?? "Push service rejected the message." };
        },
      },
      sms: {
        configured: () => riderAlertSmsMissing().length === 0,
        unavailableReason: () => `Rider SMS alerts are not configured on the server (${riderAlertSmsMissing().join(", ")}).`,
        async send(grant): Promise<ChannelOutcome> {
          const { data: profile, error } = await admin.from("profiles").select("phone").eq("id", grant.user_id).maybeSingle();
          if (error) return { status: "failed", detail: error.message };
          const mobile = indianMobile(profile?.phone ?? "");
          if (!mobile) return { status: "no_recipient", detail: "No Indian mobile number on the rider's profile." };
          const res = await sendRiderAlertSms(sms, mobile, grant.order_number);
          if (res.ok) return { status: "sent", providerId: res.messageId };
          return { status: "failed", detail: `SMS panel${res.code ? ` ${res.code}` : ""}: ${res.reason}` };
        },
      },
    } satisfies Record<RiderAlertChannel, RiderAlertPorts["channels"][RiderAlertChannel]>,
  };

  try {
    return await runRiderAlerts(ports, { orderId: opts.orderId ?? null, limit: opts.limit ?? 50 });
  } catch (e) {
    const rpc = (e as { rpc?: RpcError }).rpc ?? null;
    if (notMigrated(rpc)) return { ...emptyRiderSummary(), ok: false, reason: "not_migrated", detail: "Migration 0058 (rider alerts) is not applied to this database yet." };
    return { ...emptyRiderSummary(), ok: false, reason: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}
