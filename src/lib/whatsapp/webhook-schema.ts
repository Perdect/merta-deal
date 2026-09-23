import { z } from "zod";

/** Subset of the Meta webhook payload we act on (text messages). Unknown fields are ignored, not rejected. */
const messageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  button: z.object({ text: z.string().optional(), payload: z.string().optional() }).optional(),
  interactive: z.object({ button_reply: z.object({ id: z.string(), title: z.string() }).optional(), list_reply: z.object({ id: z.string(), title: z.string() }).optional() }).optional(),
}).passthrough();

const valueSchema = z.object({
  messaging_product: z.literal("whatsapp").optional(),
  metadata: z.object({ display_phone_number: z.string().optional(), phone_number_id: z.string().optional() }).optional(),
  contacts: z.array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() })).optional(),
  messages: z.array(messageSchema).optional(),
  statuses: z.array(z.object({ id: z.string(), status: z.string(), recipient_id: z.string().optional() }).passthrough()).optional(),
}).passthrough();

export const whatsappWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({ id: z.string().optional(), changes: z.array(z.object({ field: z.string().optional(), value: valueSchema })) })),
});
export type WhatsAppWebhook = z.infer<typeof whatsappWebhookSchema>;
export type InboundText = { waMessageId: string; from: string; profileName: string | null; body: string; type: string; timestamp: string | null; raw: unknown };

/** Flattens the webhook into inbound text-like messages (text, quick-reply button, list reply). */
export function extractInboundTexts(payload: WhatsAppWebhook): InboundText[] {
  const out: InboundText[] = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const v = change.value;
      const name = v.contacts?.[0]?.profile?.name ?? null;
      for (const m of v.messages ?? []) {
        const body = m.type === "text" ? m.text?.body : m.type === "button" ? m.button?.text : m.type === "interactive" ? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title : undefined;
        if (!body?.trim()) continue;
        out.push({ waMessageId: m.id, from: m.from, profileName: name, body: body.trim(), type: m.type, timestamp: m.timestamp ?? null, raw: m });
      }
    }
  }
  return out;
}
