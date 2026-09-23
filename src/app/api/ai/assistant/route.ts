import { NextResponse, type NextRequest } from "next/server";
import { proposeShoppingList } from "@/lib/ai/assistant";
import { matchItems } from "@/lib/ai/match";
import { clientIp, rateLimit } from "@/lib/ai/rate-limit";
import { assistantRequestSchema, type AssistantResponse } from "@/lib/ai/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { message, mode: "list" | "order" } -> AssistantResponse
 * Builds a shopping list (Claude when ANTHROPIC_API_KEY is set, otherwise rule-based, always labelled)
 * and matches every line to real in-stock products. Adding to cart happens client-side via server actions
 * (sign-in required there, not here).
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(`assistant:${clientIp(req)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests. Thoda ruk kar phir try kijiye." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const proposal = await proposeShoppingList(parsed.data);
  const lines = await matchItems(proposal.items);
  const res: AssistantResponse = { source: proposal.source, model: proposal.model, fallback_reason: proposal.fallback_reason, reply: proposal.reply, lines };
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}
