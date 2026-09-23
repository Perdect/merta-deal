import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/** Verifies Meta's `X-Hub-Signature-256: sha256=<hex>` header over the raw request body (timing-safe). */
export function verifyWhatsAppSignature(rawBody: string, header: string | null): { ok: boolean; reason?: string } {
  const secret = serverEnv().whatsappAppSecret;
  if (!secret) return { ok: false, reason: "WHATSAPP_APP_SECRET not configured" };
  if (!header?.startsWith("sha256=")) return { ok: false, reason: "Missing X-Hub-Signature-256" };
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let received: Buffer;
  try { received = Buffer.from(header.slice("sha256=".length), "hex"); } catch { return { ok: false, reason: "Malformed signature" }; }
  if (received.length !== expected.length) return { ok: false, reason: "Signature length mismatch" };
  return timingSafeEqual(received, expected) ? { ok: true } : { ok: false, reason: "Signature mismatch" };
}
