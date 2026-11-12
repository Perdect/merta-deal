import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/notifications/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Order housekeeping (0050), protected by CRON_SECRET: expires stale rider offers and re-offers waiting
 * orders, sets riders offline whose app has gone quiet, expires item exceptions, escalates unattended
 * orders and cancels unpaid online orders (setting payment_pending_minutes). The same function is
 * scheduled every minute inside the database with pg_cron where that extension exists; this route is
 * the fallback (Vercel cron, or any external scheduler) and a manual trigger. Idempotent: a second run
 * right after the first changes nothing.
 */
export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 503 });
  const { data, error } = await admin.rpc("run_order_housekeeping");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
