import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { site } from "@/config/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrder } from "@/lib/ai/parse-order";
import { matchItems } from "@/lib/ai/match";
import { linesToItems } from "@/lib/ai/assistant";
import type { MatchedLine } from "@/lib/ai/schemas";
import { formatINR } from "@/lib/utils";
import { verifyWhatsAppSignature } from "@/lib/whatsapp/signature";
import { extractInboundTexts, whatsappWebhookSchema, type InboundText } from "@/lib/whatsapp/webhook-schema";
import { isWhatsAppSendConfigured, markWhatsAppRead, sendWhatsAppText } from "@/lib/whatsapp/client";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Meta webhook verification handshake (Meta App Dashboard -> WhatsApp -> Configuration -> Callback URL). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode"); const token = sp.get("hub.verify_token"); const challenge = sp.get("hub.challenge");
  const expected = serverEnv().whatsappVerifyToken;
  if (!expected) return NextResponse.json({ error: "WHATSAPP_VERIFY_TOKEN is not configured on the server." }, { status: 503 });
  if (mode === "subscribe" && token && token === expected && challenge) return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * Inbound WhatsApp messages: verify X-Hub-Signature-256, store in whatsapp_messages, parse the order
 * (Claude or rules), match products, and reply with a summary + a checkout link to /assistant?wa=<id>.
 * Always answers 200 once the payload is accepted so Meta does not retry endlessly; per-message failures
 * are recorded on the row (status = failed, error).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = verifyWhatsAppSignature(raw, req.headers.get("x-hub-signature-256"));
  if (!sig.ok) return NextResponse.json({ error: sig.reason }, { status: sig.reason?.includes("not configured") ? 503 : 401 });

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = whatsappWebhookSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Unexpected payload shape" }, { status: 400 });
  if (parsed.data.object !== "whatsapp_business_account") return NextResponse.json({ received: true, ignored: parsed.data.object });

  const inbound = extractInboundTexts(parsed.data);
  if (!inbound.length) return NextResponse.json({ received: true, processed: 0 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "WhatsApp ordering needs SUPABASE_SERVICE_ROLE_KEY to store messages. Set it and redeploy." }, { status: 503 });

  let processed = 0;
  for (const msg of inbound) {
    // Meta retries deliveries; the unique wa_message_id makes this idempotent.
    const { data: inserted, error: insertErr } = await admin.from("whatsapp_messages")
      .upsert({ wa_message_id: msg.waMessageId, from_phone: msg.from, profile_name: msg.profileName, body: msg.body, message_type: msg.type, direction: "inbound", status: "received", raw: msg.raw as Json }, { onConflict: "wa_message_id", ignoreDuplicates: true })
      .select("id");
    if (insertErr) { console.error("whatsapp_messages insert", insertErr.message); continue; }
    const rowId = inserted?.[0]?.id;
    if (!rowId) continue; // duplicate delivery
    processed++;
    try {
      await handleMessage(admin, rowId, msg);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("whatsapp handle", detail);
      await admin.from("whatsapp_messages").update({ status: "failed", error: detail.slice(0, 500) }).eq("id", rowId);
    }
  }
  return NextResponse.json({ received: true, processed });
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function handleMessage(admin: Admin, rowId: string, msg: InboundText) {
  void markWhatsAppRead(msg.waMessageId);

  const last10 = msg.from.replace(/\D/g, "").slice(-10);
  const { data: profile } = last10.length === 10 ? await admin.from("profiles").select("id").ilike("phone", `%${last10}`).limit(1).maybeSingle() : { data: null };

  const parsedOrder = await parseOrder(msg.body);
  await admin.from("whatsapp_messages").update({ parsed_items: parsedOrder.lines as unknown as Json, matched_user_id: profile?.id ?? null, status: "parsed" }).eq("id", rowId);

  const lines = parsedOrder.lines.length ? await matchItems(linesToItems(parsedOrder.lines)) : [];
  const reply = buildReply(msg.profileName, lines, `${site.url.replace(/\/$/, "")}/assistant?wa=${rowId}`, parsedOrder.source);

  if (!isWhatsAppSendConfigured()) {
    await admin.from("whatsapp_messages").update({ status: "failed", error: "Reply not sent: WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not configured" }).eq("id", rowId);
    return;
  }
  const sent = await sendWhatsAppText(msg.from, reply);
  if (sent.ok) {
    await admin.from("whatsapp_messages").insert({ wa_message_id: sent.messageId, from_phone: msg.from, profile_name: msg.profileName, body: reply, message_type: "text", direction: "outbound", status: "replied", matched_user_id: profile?.id ?? null });
    await admin.from("whatsapp_messages").update({ status: "replied" }).eq("id", rowId);
  } else {
    await admin.from("whatsapp_messages").update({ status: "failed", error: `Reply failed: ${sent.error}`.slice(0, 500) }).eq("id", rowId);
  }
}

function buildReply(name: string | null, lines: MatchedLine[], checkoutUrl: string, source: "claude" | "rules") {
  const hello = `Namaste${name ? ` ${name.split(" ")[0]}` : ""}! ${site.name} par aapka message mila.`;
  if (!lines.length) {
    return `${hello}\n\nItem aur quantity likh kar bhejiye, jaise: "2 kg atta, 1 litre oil, Amul butter".\nYa poori list yahan banaiye: ${checkoutUrl}`;
  }
  const rows: string[] = []; let total = 0; let matched = 0;
  lines.forEach((l, i) => {
    const c = l.candidates[0];
    const asked = `${l.item.quantity}${l.item.unit ? ` ${l.item.unit}` : " x"} ${l.item.query}`;
    if (!c) { rows.push(`${i + 1}. ${asked} — abhi stock mein nahi mila`); return; }
    const price = Number(c.selling_price ?? c.mrp ?? 0) * c.suggested_packs;
    total += price; matched++;
    rows.push(`${i + 1}. ${c.name} (${c.pack_label ?? ""}) x${c.suggested_packs} — ${formatINR(price)}`);
  });
  const footer = matched ? `\nAndaazan total: ${formatINR(total)} (delivery alag).` : "";
  const via = source === "rules" ? "\n(List rule-based parser se bani hai.)" : "";
  return `${hello}\n\nAapki list:\n${rows.join("\n")}${footer}\n\nCart mein daal kar checkout karein: ${checkoutUrl}${via}`;
}
