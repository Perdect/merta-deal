import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/notifications/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily: raise restock proposals for shops a few days before their restock date, and lapse proposals nobody approved. */
export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 503 });
  const { data, error } = await (admin.rpc.bind(admin) as unknown as (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>)("generate_wholesale_proposals");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
