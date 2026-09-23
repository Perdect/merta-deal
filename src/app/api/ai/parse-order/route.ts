import { NextResponse, type NextRequest } from "next/server";
import { parseOrder } from "@/lib/ai/parse-order";
import { clientIp, rateLimit } from "@/lib/ai/rate-limit";
import { parseOrderRequestSchema } from "@/lib/ai/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST { text } -> { lines: ParsedLine[], source: "claude" | "rules" }. Used by voice ordering and WhatsApp. */
export async function POST(req: NextRequest) {
  const limit = rateLimit(`parse:${clientIp(req)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = parseOrderRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const result = await parseOrder(parsed.data.text);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
