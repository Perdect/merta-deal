import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationPayload, NotificationProvider, SendResult } from "../types";

const ENV_VARS = ["RESEND_API_KEY", "EMAIL_FROM"];
const UPSTREAM_MS = 8000;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/**
 * Email through Resend's REST API (no SDK needed). Off until RESEND_API_KEY and EMAIL_FROM are set and the
 * sending domain is verified in Resend; until then every send reports `not_configured` with the env vars.
 * The recipient is the user's own email on their profile. "sent" means Resend accepted the message
 * (its id is kept); delivery to the inbox is not confirmed here.
 */
export const emailProvider: NotificationProvider = {
  channel: "email",
  isConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM); },
  async send(payload: NotificationPayload): Promise<SendResult> {
    const key = process.env.RESEND_API_KEY ?? ""; const from = process.env.EMAIL_FROM ?? "";
    if (!key || !from) return { sent: false, reason: "not_configured", detail: `Set ${ENV_VARS.filter((k) => !process.env[k]).join(" and ")} (Resend, with a verified sending domain).`, envVars: ENV_VARS };
    const admin = createAdminClient();
    if (!admin) return { sent: false, reason: "not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY missing.", envVars: ["SUPABASE_SERVICE_ROLE_KEY"] };
    const { data: profile, error } = await admin.from("profiles").select("email, full_name").eq("id", payload.userId).maybeSingle();
    if (error) return { sent: false, reason: "error", detail: error.message };
    const to = profile?.email?.trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { sent: false, reason: "no_recipient", detail: "No email address on the profile." };

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const link = payload.url ? (payload.url.startsWith("http") ? payload.url : `${site}${payload.url}`) : "";
    const html = `<p style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#17201c"><strong>${escapeHtml(payload.title)}</strong><br>${escapeHtml(payload.body)}</p>${link ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#15803d;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open in Merta Deal admin</a></p>` : ""}`;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(UPSTREAM_MS),
        body: JSON.stringify({ from, to: [to], subject: payload.title, html, text: `${payload.title}\n${payload.body}${link ? `\n${link}` : ""}`, tags: [{ name: "type", value: (payload.type ?? "general").replace(/[^a-z0-9_-]/gi, "_") }] }),
      });
      const d = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (!r.ok) return { sent: false, reason: "error", detail: `Resend ${r.status}: ${d.message ?? d.name ?? "request rejected"}` };
      return { sent: true, count: 1, detail: d.id };
    } catch (e) {
      return { sent: false, reason: "error", detail: e instanceof Error ? e.message : String(e) };
    }
  },
};
