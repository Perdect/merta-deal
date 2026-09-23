import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Minimal Meta WhatsApp Cloud API client (Graph API v20.0).
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 * Nothing here pretends to send: every call returns the real Graph API outcome.
 */
export const GRAPH_VERSION = "v20.0";

export type WhatsAppSendResult = { ok: true; messageId: string | null } | { ok: false; status: number | null; error: string; code?: number };

export function isWhatsAppSendConfigured() {
  const s = serverEnv();
  return Boolean(s.whatsappToken && s.whatsappPhoneId);
}

/** E.164 digits without "+" (Meta's `to` format). Indian 10-digit numbers get the 91 prefix. */
export function toWaNumber(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return d;
}

async function post(body: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const { whatsappToken, whatsappPhoneId } = serverEnv();
  if (!whatsappToken || !whatsappPhoneId) return { ok: false, status: null, error: "WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not configured" };
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${whatsappPhoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${whatsappToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    if (!res.ok) return { ok: false, status: res.status, error: json.error?.message ?? `Graph API error ${res.status}`, code: json.error?.code };
    return { ok: true, messageId: json.messages?.[0]?.id ?? null };
  } catch (err) {
    return { ok: false, status: null, error: err instanceof Error ? err.message : "Network error" };
  }
}

/** Free-form text. Only delivered inside the 24-hour customer-service window (i.e. after the user messaged you). */
export function sendWhatsAppText(to: string, body: string, previewUrl = true) {
  return post({ to: toWaNumber(to), type: "text", text: { body: body.slice(0, 4096), preview_url: previewUrl } });
}

/** Pre-approved template (business-initiated messages outside the 24-hour window). */
export function sendWhatsAppTemplate(to: string, template: string, bodyParams: string[], language = "en") {
  return post({
    to: toWaNumber(to), type: "template",
    template: { name: template, language: { code: language }, components: bodyParams.length ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }] : [] },
  });
}

/** Marks an inbound message as read (blue ticks). Best-effort. */
export function markWhatsAppRead(messageId: string) {
  return post({ status: "read", message_id: messageId });
}
