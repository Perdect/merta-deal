import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/lib/ai/rate-limit";
import { maskPhone } from "@/lib/utils";
import type { ParsedLine } from "@/lib/order-parser";

export const dynamic = "force-dynamic";

const querySchema = z.object({ id: z.string().uuid() });

/**
 * GET ?id=<whatsapp_messages.id> -> { id, from, body, lines }
 * Lets /assistant?wa=<id> prefill the list parsed from a WhatsApp message. The id is an unguessable UUID
 * that was only ever sent to the sender's own WhatsApp number; we still expose nothing but the parsed
 * lines, the message text and a masked phone.
 */
export async function GET(req: NextRequest) {
  const limit = rateLimit(`wa-draft:${clientIp(req)}`, 30, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = querySchema.safeParse({ id: req.nextUrl.searchParams.get("id") ?? "" });
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "WhatsApp drafts need SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 503 });
  const { data, error } = await admin.from("whatsapp_messages").select("id, from_phone, body, parsed_items, status, direction, created_at").eq("id", parsed.data.id).eq("direction", "inbound").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  const lines = Array.isArray(data.parsed_items) ? (data.parsed_items as unknown as ParsedLine[]) : [];
  return NextResponse.json({ id: data.id, from: maskPhone(data.from_phone), body: data.body ?? "", lines, status: data.status, created_at: data.created_at }, { headers: { "Cache-Control": "no-store" } });
}
