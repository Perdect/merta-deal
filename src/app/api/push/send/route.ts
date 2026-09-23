import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(500).default(""),
  url: z.string().max(2048).optional(),
  tag: z.string().max(64).optional(),
});

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * POST /api/push/send — deliver a web-push notification to every device of one user.
 * Callers: an admin session, or a server-side job presenting `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.
 * Subscriptions rejected with 404/410 by the push service are deleted.
 */
export async function POST(req: NextRequest) {
  const parsed = payloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload: expected { userId, title, body, url? }" }, { status: 400 });

  const secrets = serverEnv();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const viaService = Boolean(secrets.serviceRoleKey) && bearer.length > 0 && safeEqual(bearer, secrets.serviceRoleKey);
  if (!viaService) {
    const supabase = await createClient();
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (!env.vapidPublicKey || !secrets.vapidPrivateKey) {
    return NextResponse.json({ ok: false, error: "Web push is not configured: set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (generate with `pnpm push:keys`, see /setup)." }, { status: 503 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required to read push subscriptions on the server." }, { status: 503 });

  const { userId, title, body, url, tag } = parsed.data;
  const { data: subs, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId).limit(50);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!subs?.length) return NextResponse.json({ ok: true, sent: 0, removed: 0, failed: 0, message: "No push subscriptions for this user" });

  webpush.setVapidDetails(secrets.vapidSubject, env.vapidPublicKey, secrets.vapidPrivateKey);
  const payload = JSON.stringify({ title, body, url: url ?? "/account/notifications", tag });
  const results = await Promise.allSettled(subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 })));

  const stale: string[] = []; let sent = 0; let failed = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") { sent++; return; }
    const code = (r.reason as { statusCode?: number } | undefined)?.statusCode;
    if (code === 404 || code === 410) stale.push(subs[i].endpoint); else failed++;
  });
  if (stale.length) await admin.from("push_subscriptions").delete().in("endpoint", stale);
  return NextResponse.json({ ok: true, sent, removed: stale.length, failed });
}
