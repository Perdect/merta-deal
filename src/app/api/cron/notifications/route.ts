import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushProvider } from "@/lib/notifications/providers/push";
import { requireCronSecret } from "@/lib/notifications/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

/**
 * Delivers pending push notifications: rows in `notifications` with 'push' in channels and sent_push = false.
 * Protected by CRON_SECRET. Marks rows sent when push was delivered or the user has no subscription;
 * leaves them pending when push is not configured or the push service errored, so the next run retries.
 */
export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;
  const q = querySchema.safeParse({ limit: req.nextUrl.searchParams.get("limit") ?? undefined });
  if (!q.success) return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 503 });
  if (!pushProvider.isConfigured()) return NextResponse.json({ ok: false, reason: "not_configured", detail: "Web Push needs NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT. Rows stay pending." }, { status: 200 });

  const { data: rows, error } = await admin.from("notifications").select("id, user_id, type, title, body, data").contains("channels", ["push"]).eq("sent_push", false).order("created_at", { ascending: true }).limit(q.data.limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0, skipped = 0, failed = 0; const done: string[] = []; const failures: { id: string; detail?: string }[] = [];
  for (const n of rows ?? []) {
    const d = (n.data ?? {}) as Record<string, unknown>;
    const url = typeof d.url === "string" ? d.url : typeof d.order_id === "string" ? `/orders/${d.order_id}` : null;
    const res = await pushProvider.send({ userId: n.user_id, title: n.title, body: n.body, url, data: d, type: n.type });
    if (res.sent) { sent++; done.push(n.id); }
    else if (res.reason === "no_recipient") { skipped++; done.push(n.id); }
    else { failed++; failures.push({ id: n.id, detail: res.detail }); }
  }
  if (done.length) await admin.from("notifications").update({ sent_push: true }).in("id", done);
  return NextResponse.json({ ok: true, processed: rows?.length ?? 0, sent, skipped_no_subscription: skipped, failed, failures: failures.slice(0, 10) });
}
