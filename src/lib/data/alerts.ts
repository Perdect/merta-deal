import "server-only";
import { createClient } from "@/lib/supabase/server";
import { channelStatus } from "@/lib/notifications/dispatch";
import type { ChannelRow, RecentAlert } from "@/components/admin/alerts/channel-status";
import type { DeliveryCodeEvent, DeliveryCodeStatusData, RiderAlertChannelRow, RiderAlertEvent } from "@/components/admin/notifications-admin";
import { deliveryCodeSmsStatus } from "@/lib/notifications/delivery-code";
import { pushProvider } from "@/lib/notifications/providers/push";
import { riderSmsStatus } from "@/lib/notifications/rider-alerts";

type Summary = Record<string, { last_status?: string | null; last_at?: string | null; last_error?: string | null; sent_24h?: number; failed_24h?: number }>;
const NEEDS: Record<ChannelRow["channel"], string[]> = {
  push: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
  whatsapp: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_NOTIFY_TEMPLATE (approved template)"],
  email: ["RESEND_API_KEY", "EMAIL_FROM (verified domain)"],
};

/** The admin status area's data: configuration from the server env, outcomes from notification_deliveries. */
export async function getAlertChannelStatus(): Promise<{ channels: ChannelRow[]; recent: RecentAlert[]; cronHint: string | null }> {
  const supabase = await createClient();
  const configured = new Map(channelStatus().map((c) => [c.channel, c.configured]));
  const [summary, recent, cron] = await Promise.all([
    supabase.rpc("admin_alert_channel_summary").then((r) => (r.data ?? {}) as Summary, () => ({} as Summary)),
    supabase.rpc("admin_recent_order_alerts", { p_limit: 8 }).then((r) => (r.data ?? []) as unknown as RecentAlert[], () => [] as RecentAlert[]),
    supabase.from("settings").select("key, value").in("key", ["notifications_cron_url", "notifications_cron_secret"]).then((r) => r.data ?? [], () => []),
  ]);
  const channels = (["push", "whatsapp", "email"] as const).map((channel) => {
    const s = summary[channel] ?? {};
    return { channel, configured: Boolean(configured.get(channel)), needs: NEEDS[channel], last_status: s.last_status ?? null, last_at: s.last_at ?? null, last_error: s.last_error ?? null, sent_24h: Number(s.sent_24h ?? 0), failed_24h: Number(s.failed_24h ?? 0) };
  });
  const url = String(cron.find((c) => c.key === "notifications_cron_url")?.value ?? "").replace(/^"|"$/g, "");
  const secret = String(cron.find((c) => c.key === "notifications_cron_secret")?.value ?? "").replace(/^"|"$/g, "");
  const cronHint = url && secret
    ? `Alerts are also sent every minute by the database scheduler (${url}), so they go out even when no admin page is open.`
    : "Alerts go out right after an order is placed and whenever an admin page is open. For a minute-by-minute retry with every page closed, set “Notification delivery URL” and “secret” under Settings → Integrations (the hosting plan's own scheduler runs only once a day).";
  return { channels, recent, cronHint };
}

type RiderSummary = Record<string, { last_status?: string | null; last_at?: string | null; last_error?: string | null; sent_24h?: number; failed_24h?: number; skipped_24h?: number; no_device_24h?: number }>;

/**
 * Rider alert status for Admin → Notifications: per channel whether the server can send at all (and the
 * names of what is missing), the latest real outcome and the day's counts; then the recent requests and
 * "no longer yours" notices with each channel's state, attempts and the provider's answer. `available` is
 * false until migration 0058 is applied, and the screen says so instead of showing an empty list.
 */
export async function getRiderAlertStatus(): Promise<{ available: boolean; channels: RiderAlertChannelRow[]; recent: RiderAlertEvent[] }> {
  const supabase = await createClient();
  const [summary, recent] = await Promise.all([
    supabase.rpc("admin_rider_alert_summary" as never).then((r) => (r.error ? null : ((r.data ?? {}) as unknown as RiderSummary)), () => null),
    supabase.rpc("admin_recent_rider_alerts" as never, { p_limit: 12 } as never).then((r) => (r.error ? [] : ((r.data ?? []) as unknown as RiderAlertEvent[])), () => [] as RiderAlertEvent[]),
  ]);
  const sms = riderSmsStatus();
  const config: Record<RiderAlertChannelRow["channel"], { configured: boolean; needs: string[] }> = {
    push: { configured: pushProvider.isConfigured(), needs: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "SUPABASE_SERVICE_ROLE_KEY"] },
    sms: { configured: sms.configured, needs: sms.missing },
  };
  const channels = (["push", "sms"] as const).map((channel) => {
    const row = summary?.[channel] ?? {};
    return { channel, ...config[channel], last_status: row.last_status ?? null, last_at: row.last_at ?? null, last_error: row.last_error ?? null,
      sent_24h: Number(row.sent_24h ?? 0), failed_24h: Number(row.failed_24h ?? 0), skipped_24h: Number(row.skipped_24h ?? 0), no_device_24h: Number(row.no_device_24h ?? 0) };
  });
  return { available: summary !== null, channels, recent };
}

type DeliveryCodeLog = { summary?: { last_status?: string | null; last_at?: string | null; last_error?: string | null; sent_24h?: number; failed_24h?: number; not_sent_24h?: number } | null; recent?: DeliveryCodeEvent[] | null };

/**
 * Delivery code SMS status for Admin → Notifications (0059): whether the server can send at all (and the
 * names of what is missing), the latest real outcome, the day's counts, and the recent requests with what
 * the SMS panel answered. `available` is false until migration 0059 is applied (or for a non-admin), and
 * the screen says so. Nothing here carries a code, a phone number or a customer's name.
 */
export async function getDeliveryCodeStatus(): Promise<DeliveryCodeStatusData> {
  const supabase = await createClient();
  const log = await supabase.rpc("admin_delivery_code_log" as never, { p_limit: 12 } as never).then((r) => (r.error ? null : ((r.data ?? {}) as unknown as DeliveryCodeLog)), () => null);
  const sms = deliveryCodeSmsStatus();
  const s = log?.summary ?? {};
  return {
    available: log !== null, configured: sms.configured, needs: sms.missing,
    summary: { last_status: s.last_status ?? null, last_at: s.last_at ?? null, last_error: s.last_error ?? null, sent_24h: Number(s.sent_24h ?? 0), failed_24h: Number(s.failed_24h ?? 0), not_sent_24h: Number(s.not_sent_24h ?? 0) },
    recent: log?.recent ?? [],
  };
}
