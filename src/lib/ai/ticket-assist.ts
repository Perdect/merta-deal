import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AI_MODEL, getAnthropic } from "./client";

/**
 * Support-ticket assistance for staff: a short summary of the conversation, a draft reply and next steps.
 *
 * It never acts: the result is text for a member of staff to read, edit and send through the normal reply
 * box. Only the conversation goes to Claude, and it is cut down first — no customer name, phone, email,
 * address or order number is included, and anything that looks like a phone number, an email address or a
 * long reference inside a message is masked. The linked order contributes its status words only.
 */
export type TicketAssistInput = {
  subject: string; category: string; priority: string; status: string;
  messages: { from: "customer" | "support"; text: string; at: string }[];
  order: { status: string; payment_status: string | null; placed_at: string } | null;
};
export type TicketAssistResult =
  | { ok: true; summary: string; reply: string; nextSteps: string[]; model: string; shared: { messages: number; order: boolean } }
  | { ok: false; reason: "not_configured" | "empty" | "failed"; message: string };

/** How much of a long conversation is sent: the opening message and the most recent ones. */
const MAX_MESSAGES = 30;
const MAX_CHARS = 1500;

/** Masks what could identify a person inside free text. The reply box still shows staff the real message. */
export function redactPersonal(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email hidden]")
    .replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, "[phone hidden]")
    .replace(/\b[A-Z]{2,4}\d{6,}\b/g, "[reference hidden]")
    .replace(/\b\d{6,}\b/g, "[number hidden]");
}

const outputSchema = z.object({
  summary: z.string().min(1).max(600),
  reply: z.string().min(1).max(1800),
  next_steps: z.array(z.string().min(1).max(200)).max(4),
});

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "reply", "next_steps"],
  properties: {
    summary: { type: "string", description: "Two or three plain sentences for staff: what the customer wants and where the conversation stands." },
    reply: { type: "string", description: "A draft reply to the customer, ready for staff to edit. No greeting by name, no signature." },
    next_steps: { type: "array", items: { type: "string" }, description: "Up to four short things staff should check or do before or after replying. Empty when there is nothing to add." },
  },
} as const;

const SYSTEM = `You help the support staff of Merta Deal, a grocery delivery shop in Merta City, Rajasthan. A member of staff has opened a customer's support ticket and wants a summary and a draft reply. They will read and edit your draft before anything is sent.

Work only from the ticket you are given. Personal details have been removed on purpose (you will see markers such as [phone hidden]); do not ask for them and do not guess them. You cannot see the shop's records beyond what is written here, so never state a refund amount, a delivery time, a stock level or a policy as fact unless it appears in the ticket. Where the answer depends on something you cannot see, say what staff should check, in next_steps, and word the reply so that it is true either way.

The draft reply: write in the language the customer wrote in (Hindi, Hinglish or English), keep it short and warm, answer what was asked, and say plainly what happens next. No name, no signature, no placeholders in brackets.`;

export async function ticketAssist(input: TicketAssistInput): Promise<TicketAssistResult> {
  const client = getAnthropic();
  if (!client) return { ok: false, reason: "not_configured", message: "AI assistance is not set up. It needs ANTHROPIC_API_KEY on the server." };
  if (!input.messages.length) return { ok: false, reason: "empty", message: "There are no messages on this ticket to work from yet." };

  const picked = input.messages.length > MAX_MESSAGES ? [input.messages[0], ...input.messages.slice(-(MAX_MESSAGES - 1))] : input.messages;
  const conversation = picked.map((m) => `[${m.from === "customer" ? "Customer" : "Support"} · ${m.at}]\n${redactPersonal(m.text).slice(0, MAX_CHARS)}`).join("\n\n");
  const context = [
    `Subject: ${redactPersonal(input.subject)}`,
    `Category: ${input.category} · Priority: ${input.priority} · Ticket status: ${input.status}`,
    input.order ? `Linked order: status "${input.order.status}"${input.order.payment_status ? `, payment "${input.order.payment_status}"` : ""}, placed ${input.order.placed_at}` : "Linked order: none",
    picked.length < input.messages.length ? `(${input.messages.length - picked.length} earlier messages are left out.)` : "",
    "", "Conversation:", conversation,
  ].filter((l) => l !== "").join("\n");

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema", schema: JSON_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: context }],
    });
    if (response.stop_reason === "refusal") return { ok: false, reason: "failed", message: "Claude declined to draft a reply for this ticket." };
    if (response.stop_reason === "max_tokens") return { ok: false, reason: "failed", message: "The draft was cut off. Try again." };
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    let json: unknown;
    try { json = JSON.parse(text); } catch { return { ok: false, reason: "failed", message: "Claude's answer could not be read. Try again." }; }
    const parsed = outputSchema.safeParse(json);
    if (!parsed.success) return { ok: false, reason: "failed", message: "Claude's answer was incomplete. Try again." };
    return { ok: true, summary: parsed.data.summary.trim(), reply: parsed.data.reply.trim(), nextSteps: parsed.data.next_steps.map((s) => s.trim()).filter(Boolean), model: response.model, shared: { messages: picked.length, order: Boolean(input.order) } };
  } catch (err) {
    const message = err instanceof Anthropic.AuthenticationError ? "The AI key was rejected. Check ANTHROPIC_API_KEY."
      : err instanceof Anthropic.RateLimitError ? "The AI service is busy. Try again in a minute."
      : err instanceof Anthropic.APIConnectionError ? "Could not reach the AI service. Check the connection and try again."
      : err instanceof Anthropic.APIError ? `The AI service returned an error (${err.status ?? "unknown"}).`
      : "The draft could not be made.";
    console.error("ticket-assist", err instanceof Anthropic.APIError ? err.status : "", err instanceof Error ? err.name : "");
    return { ok: false, reason: "failed", message };
  }
}
