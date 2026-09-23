import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";

export const dynamic = "force-dynamic";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  userAgent: z.string().max(512).optional(),
});

/**
 * POST /api/push/subscribe — store the caller's web-push subscription (same as `savePushSubscriptionAction`,
 * exposed for non-React callers such as the service worker or a native shell). Requires a signed-in session.
 */
export async function POST(req: NextRequest) {
  const parsed = subscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid subscription payload" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in" }, { status: 401 });
  const { endpoint, keys, userAgent } = parsed.data;
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: userAgent ?? req.headers.get("user-agent") ?? null },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ ok: false, error: friendlyError(error) }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/push/subscribe — remove a subscription by endpoint (RLS limits it to the caller's own rows). */
export async function DELETE(req: NextRequest) {
  const parsed = z.object({ endpoint: z.string().url() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in" }, { status: 401 });
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).eq("user_id", user.id);
  if (error) return NextResponse.json({ ok: false, error: friendlyError(error) }, { status: 400 });
  return NextResponse.json({ ok: true });
}
