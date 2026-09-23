import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { parseOrderText, type ParsedLine } from "@/lib/order-parser";
import { site } from "@/config/site";
import { AI_MODEL, getAnthropic } from "./client";
import { shoppingItemSchema, UNITS, type AssistantSource, type ShoppingItem } from "./schemas";
import { generateStarterList, looksLikePlanningRequest } from "./starter-lists";

export type ProposeInput = { message: string; mode: "list" | "order" };
export type ProposeResult = { source: AssistantSource; model: string | null; fallback_reason: string | null; reply: string; items: ShoppingItem[] };

const SYSTEM_PROMPT = `You are the shopping assistant of ${site.name} ("${site.tagline}"), a hyperlocal kirana (grocery) marketplace in ${site.city}, ${site.state}, India (pincodes 341510, 341511).
Customers write in Hinglish, Hindi or English — e.g. "Bhai 2 kilo aata aur ek kilo chini bhej do", "Diwali sweets aur namkeen", "family of 4 ke liye ek hafte ka saaman".
Prices are in rupees (₹). Typical kirana pack sizes: atta 1/5/10 kg, rice 1/5 kg, dal 500 g/1 kg, oil 1 l pouch, sugar 1 kg, salt 1 kg, milk 500 ml pouch, masale 100/200 g, ghee 500 g/1 l, biscuits/namkeen packets.
Indian households: atta about 2 kg per person per week, rice about 1 kg, dal 300-500 g, oil about 500 ml, sugar about 300 g, milk about 500 ml per person per day.

Your job: turn the customer's message into a concrete shopping list by calling the propose_shopping_list tool exactly once.
Rules for items:
- "query" is a short product search term (1-4 words) that a kirana catalogue search will understand: prefer the generic product name (atta, toor dal, refined oil, Amul butter, Mathania mirch). Keep Hinglish names that shopkeepers use (aata->atta, chini->sugar, namak->salt, tel->cooking oil, doodh->milk, dahi->curd, pyaz->onion, aloo->potato, tamatar->tomato, haldi->haldi powder, mirch->red chilli powder, dhaniya->dhania powder).
- "quantity" is a positive number; "unit" is one of ${UNITS.join(", ")} or null when the item is countable/unclear.
- "note" is an optional short hint (brand preference, purpose) or null.
- For planning requests (family of N, a week/month, festival), produce a complete but realistic list scaled to household size and duration — 10-25 items. For dictated orders, extract exactly what was asked, nothing more.
- Never invent prices. Never include non-grocery or unsafe items. Skip items that a kirana store would not sell.
"reply" is one or two friendly Hinglish sentences summarising what you prepared (no markdown, no prices).`;

const TOOL: Anthropic.Tool = {
  name: "propose_shopping_list",
  description: "Return the structured shopping list for the customer's request. Call this exactly once.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "One or two friendly Hinglish sentences summarising the list." },
      items: {
        type: "array",
        description: "Shopping list lines. Empty when the message contains nothing purchasable.",
        items: {
          type: "object",
          properties: {
            query: { type: "string", description: "Short product search term, e.g. 'toor dal', 'Aashirvaad atta', 'Amul butter'." },
            quantity: { type: "number", description: "Positive quantity in the given unit, or number of packs when unit is null." },
            unit: { anyOf: [{ type: "string", enum: [...UNITS] }, { type: "null" }], description: "Unit of the quantity or null for countable/unclear." },
            note: { anyOf: [{ type: "string" }, { type: "null" }], description: "Optional short hint such as brand or purpose." },
          },
          required: ["query", "quantity", "unit", "note"],
          additionalProperties: false,
        },
      },
    },
    required: ["reply", "items"],
    additionalProperties: false,
  },
};

const toolOutputSchema = z.object({ reply: z.string().max(600), items: z.array(shoppingItemSchema).max(60) });

/** ParsedLine (rule parser) -> ShoppingItem. */
export function linesToItems(lines: ParsedLine[]): ShoppingItem[] {
  return lines.map((l) => ({ query: l.query, quantity: l.quantity, unit: (UNITS as readonly string[]).includes(l.unit ?? "") ? (l.unit as ShoppingItem["unit"]) : null, note: null }));
}

/** ShoppingItem -> ParsedLine (for callers that speak the rule-parser shape, e.g. WhatsApp + voice ordering). */
export function itemsToLines(items: ShoppingItem[]): ParsedLine[] {
  return items.map((i) => ({ raw: [i.quantity, i.unit, i.query].filter(Boolean).join(" "), query: i.query, quantity: i.quantity, unit: i.unit }));
}

function proposeWithRules(input: ProposeInput): ProposeResult {
  if (input.mode === "list" && looksLikePlanningRequest(input.message)) {
    const plan = generateStarterList(input.message);
    return { source: "rules", model: null, fallback_reason: null, reply: `${plan.summary} Yeh ek starter list hai — quantities apne hisaab se badal lijiye.`, items: plan.items };
  }
  const lines = parseOrderText(input.message);
  if (lines.length) return { source: "rules", model: null, fallback_reason: null, reply: `Aapke message se ${lines.length} item${lines.length > 1 ? "s" : ""} samjhe. Neeche best match dekh kar cart mein add kijiye.`, items: linesToItems(lines) };
  return { source: "rules", model: null, fallback_reason: null, reply: "Samajh nahi aaya. Item ke naam aur quantity likhiye — jaise \"2 kg atta, 1 litre oil, Amul butter\" — ya \"family of 4 for one week\" jaisa plan maangiye.", items: [] };
}

/**
 * Produces a shopping list from free text. Uses Claude when ANTHROPIC_API_KEY is configured,
 * otherwise (or when the call fails) the deterministic rule-based path, always labelled via `source`.
 */
export async function proposeShoppingList(input: ProposeInput): Promise<ProposeResult> {
  const client = getAnthropic();
  if (!client) return proposeWithRules(input);
  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name, disable_parallel_tool_use: true },
      messages: [{ role: "user", content: `Mode: ${input.mode === "order" ? "dictated order (extract exactly what is asked)" : "shopping list / planning"}\nCustomer message: ${input.message}` }],
    });
    if (response.stop_reason === "refusal") return { ...proposeWithRules(input), fallback_reason: "Claude declined this request" };
    if (response.stop_reason === "max_tokens") return { ...proposeWithRules(input), fallback_reason: "Claude output was cut off" };
    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL.name);
    if (!toolUse) return { ...proposeWithRules(input), fallback_reason: "Claude returned no list" };
    const parsed = toolOutputSchema.safeParse(toolUse.input);
    if (!parsed.success) return { ...proposeWithRules(input), fallback_reason: "Claude output failed validation" };
    return { source: "claude", model: response.model, fallback_reason: null, reply: parsed.data.reply.trim(), items: parsed.data.items };
  } catch (err) {
    const reason = err instanceof Anthropic.AuthenticationError ? "ANTHROPIC_API_KEY rejected"
      : err instanceof Anthropic.RateLimitError ? "Claude rate limit reached"
      : err instanceof Anthropic.APIConnectionError ? "Could not reach Claude"
      : err instanceof Anthropic.APIError ? `Claude error ${err.status ?? ""}`.trim()
      : "Claude call failed";
    console.error("assistant/claude", reason, err instanceof Error ? err.message : err);
    return { ...proposeWithRules(input), fallback_reason: reason };
  }
}
