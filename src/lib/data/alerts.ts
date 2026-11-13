import "server-only";
import { createClient } from "@/lib/supabase/server";
import { channelStatus } from "@/lib/notifications/dispatch";
import type { ChannelRow, RecentAlert } from "@/components/admin/alerts/channel-status";

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
