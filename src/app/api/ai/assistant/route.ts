import { NextResponse, type NextRequest } from "next/server";
import { askAssistant } from "@/lib/ai/assistant";
import { getCatalogueIndex, matchPlannedItems } from "@/lib/ai/assistant-catalogue";
import { isClaudeConfigured } from "@/lib/ai/client";
import { clientIp, rateLimit } from "@/lib/ai/rate-limit";
import { getReorderSuggestions } from "@/lib/ai/reorder";
import { getShopFacts } from "@/lib/ai/shop-facts";
import { assistantAskSchema, type AssistantAnswer, type AssistantLink } from "@/lib/ai/assistant-types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HELP_LINKS: AssistantLink[] = [
  { href: "/track", label: "Track an order" },
  { href: "/account/orders", label: "My orders" },
  { href: "/account/support", label: "Support" },
];
const DELIVERY_LINK: AssistantLink = { href: "/delivery-area", label: "Delivery area & charges" };

/** "Buy again": read from the signed-in customer's own delivered orders. The AI is not called and sees none of it. */
async function reorderAnswer(base: Pick<AssistantAnswer, "source" | "model" | "fallback_reason">): Promise<AssistantAnswer> {
  const answer = { ...base, intent: "reorder" as const, lines_from: "orders" as const, lines: [], facts: [], links: [] as AssistantLink[] };
  const r = await getReorderSuggestions();
  if (r.status === "signed_out") return { ...answer, needs_sign_in: true, reply: "Pichhle orders se suggestion sirf sign in karne ke baad dikhte hain, kyunki woh aapke apne orders se bante hain." };
  if (r.status === "error") return { ...answer, reply: `Aapke pichhle orders abhi nahi padh paaye (${r.message}). Thodi der mein dobara try kijiye.`, links: [HELP_LINKS[1]] };
  if (r.status === "empty") return { ...answer, reply: "Aapke account mein abhi koi delivered order nahi hai, isliye dobara mangwane ke liye koi suggestion nahi hai." };
  return { ...answer, lines: r.lines, reply: `Yeh aapke pichhle ${r.orders} delivered order${r.orders === 1 ? "" : "s"} mein sabse zyada aaye products hain, aaj ke daam aur stock ke saath. Jo chahiye wahi chuniye.`, links: [HELP_LINKS[1]] };
}

/**
 * POST { message, mode: "list" | "order", action?: "ask" | "reorder" } -> AssistantAnswer
 *
 * Reads the message (Claude when ANTHROPIC_API_KEY is set, otherwise the rules; always labelled), then
 * fills the answer from live data: catalogue rows with today's price and stock for a list, blocks written
 * from the settings and delivery zones for a question, the customer's own delivered orders for "buy
 * again". Nothing is added to a cart here; the customer chooses on the page and the cart is changed only
 * by its own server action.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(`assistant:${clientIp(req)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests. Thoda ruk kar phir try kijiye." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = assistantAskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const send = (answer: AssistantAnswer) => NextResponse.json(answer, { headers: { "Cache-Control": "no-store" } });

  if (parsed.data.action === "reorder") return send(await reorderAnswer({ source: "orders", model: null, fallback_reason: null }));

  // The catalogue list is only of use to the model; the rules search the shop item by item instead.
  const [facts, catalogue] = await Promise.all([
    getShopFacts(),
    isClaudeConfigured() ? getCatalogueIndex().catch(() => null) : Promise.resolve(null),
  ]);
  const result = await askAssistant({ message: parsed.data.message, mode: parsed.data.mode, facts, catalogue });
  const base = { source: result.source, model: result.model, fallback_reason: result.fallback_reason };

  if (result.intent === "reorder") return send(await reorderAnswer(base));

  const lines = await matchPlannedItems(result.items, catalogue, { modelSawCatalogue: result.source === "claude" });
  const factCards = result.topics.flatMap((t) => (facts.cards[t] ? [facts.cards[t]] : []));
  const links: AssistantLink[] = [
    ...(factCards.length ? [DELIVERY_LINK] : []),
    // Where to go when the assistant could not answer: account matters, and questions the shop data does not cover.
    ...(result.intent === "account" || result.intent === "other" || (result.intent === "shop_question" && !factCards.length) ? HELP_LINKS : []),
    ...(result.intent === "shop_question" && !factCards.length ? [DELIVERY_LINK] : []),
  ];
  return send({ ...base, intent: result.intent, reply: result.reply, lines_from: "request", lines, facts: factCards, links });
}
