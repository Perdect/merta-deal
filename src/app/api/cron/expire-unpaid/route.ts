import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/notifications/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({ minutes: z.coerce.number().int().min(5).max(24 * 60).default(30) });

/**
 * Cancels online-payment orders that were never paid: rpc expire_unpaid_orders(p_minutes) with the service role.
 * Protected by CRON_SECRET. Default window 30 minutes (override with ?minutes=).
 */
export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;
  const q = querySchema.safeParse({ minutes: req.nextUrl.searchParams.get("minutes") ?? undefined });
  if (!q.success) return NextResponse.json({ error: "Invalid minutes" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 503 });
  const { data, error } = await admin.rpc("expire_unpaid_orders", { p_minutes: q.data.minutes });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, expired: data ?? 0, minutes: q.data.minutes });
}
