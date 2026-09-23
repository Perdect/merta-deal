import "server-only";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWhatsAppSendConfigured, sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/whatsapp/client";
import type { NotificationPayload, NotificationProvider, SendResult } from "../types";

const ENV_VARS = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_NOTIFY_TEMPLATE (optional)"];

/**
 * WhatsApp Cloud API. Business-initiated messages outside the 24-hour customer window MUST use an
 * approved template — set WHATSAPP_NOTIFY_TEMPLATE to a template with two body params ({{1}} title, {{2}} body).
 * Without a template we attempt a plain text message, which Meta only delivers inside the service window,
 * and we report Meta's error verbatim when it is not.
 */
export const whatsappProvider: NotificationProvider = {
  channel: "whatsapp",
  isConfigured() { return isWhatsAppSendConfigured() && Boolean(serverEnv().serviceRoleKey); },
  async send(payload: NotificationPayload): Promise<SendResult> {
    if (!isWhatsAppSendConfigured()) return { sent: false, reason: "not_configured", detail: "WhatsApp Cloud API credentials missing.", envVars: ENV_VARS };
    const admin = createAdminClient();
    if (!admin) return { sent: false, reason: "not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY missing.", envVars: ENV_VARS };
    const { data: profile, error } = await admin.from("profiles").select("phone").eq("id", payload.userId).maybeSingle();
    if (error) return { sent: false, reason: "error", detail: error.message };
    if (!profile?.phone) return { sent: false, reason: "no_recipient", detail: "User has no phone number on their profile." };

    const template = process.env.WHATSAPP_NOTIFY_TEMPLATE?.trim();
    const link = payload.url ? (payload.url.startsWith("http") ? payload.url : `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${payload.url}`) : "";
    const res = template
      ? await sendWhatsAppTemplate(profile.phone, template, [payload.title, payload.body], process.env.WHATSAPP_TEMPLATE_LANG?.trim() || "en")
      : await sendWhatsAppText(profile.phone, `*${payload.title}*\n${payload.body}${link ? `\n${link}` : ""}`);
    if (res.ok) return { sent: true, count: 1, detail: res.messageId ?? undefined };
    return { sent: false, reason: "error", detail: `${res.error}${res.code ? ` (code ${res.code})` : ""}${!template ? " — outside the 24h window a template is required (WHATSAPP_NOTIFY_TEMPLATE)." : ""}` };
  },
};
