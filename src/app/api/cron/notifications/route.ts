import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverPendingPush } from "@/lib/notifications/deliver";
import { deliverOrderAlerts } from "@/lib/notifications/order-alerts";
import { requireCronSecret } from "@/lib/notifications/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

/**
 * Scheduled notification work, protected by CRON_SECRET:
 * 1. escalate_unattended_orders(): an order nobody accepted within the configured time notifies every admin.
 * 2. Sends admins' new-order alerts through every configured channel (push, WhatsApp, email), once per channel.
 * 3. Delivers any other pending push notifications (rows with 'push' in channels and sent_push = false).
 * All steps are idempotent, so overlapping runs are safe. pg_cron can call this every minute (run_notification_cron).
 */
export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;
  const q = querySchema.safeParse({ limit: req.nextUrl.searchParams.get("limit") ?? undefined });
  if (!q.success) return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 503 });

  const { data: escalated, error: escErr } = await admin.rpc("escalate_unattended_orders");
  const alerts = await deliverOrderAlerts({ limit: q.data.limit });
  const push = await deliverPendingPush(q.data.limit);
  return NextResponse.json({ ...push, order_alerts: alerts, escalated: escErr ? null : Number(escalated ?? 0), escalation_error: escErr?.message ?? null });
}
