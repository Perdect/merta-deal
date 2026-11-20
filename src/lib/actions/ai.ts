"use server";
import { createClient } from "@/lib/supabase/server";
import { getTicketAdmin } from "@/lib/data/admin";
import { ticketAssist, type TicketAssistResult } from "@/lib/ai/ticket-assist";
import { ORDER_STATUS_META, PAYMENT_STATUS_LABEL, type OrderStatus } from "@/lib/order-status";
import { formatDateTime } from "@/lib/utils";

/**
 * Staff-only: summary, draft reply and next steps for one support ticket. Admins only (the same check the
 * other admin actions make); it reads the ticket and writes nothing. The draft goes back to the reply box
 * for a person to edit and send.
 */
export async function ticketAssistAction(ticketId: string): Promise<TicketAssistResult> {
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return { ok: false, reason: "failed", message: "This ticket could not be found." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "failed", message: "Your session has expired. Sign in again." };
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, reason: "failed", message: "Only admins can use this." };

  const detail = await getTicketAdmin(ticketId).catch(() => null);
  if (!detail) return { ok: false, reason: "failed", message: "This ticket could not be loaded." };
  const { ticket, messages } = detail;
  // The linked order contributes its status in words only: no number, items, amount or address.
  let order: { status: string; payment_status: string | null; placed_at: string } | null = null;
  if (ticket.order_id) {
    const { data } = await supabase.from("orders").select("status, payment_status, created_at").eq("id", ticket.order_id).maybeSingle();
    if (data) order = {
      status: ORDER_STATUS_META[data.status as OrderStatus]?.label ?? data.status,
      payment_status: data.payment_status ? PAYMENT_STATUS_LABEL[data.payment_status] ?? data.payment_status : null,
      placed_at: formatDateTime(data.created_at),
    };
  }
  return ticketAssist({
    subject: ticket.subject, category: ticket.category, priority: ticket.priority, status: ticket.status,
    messages: messages.map((m) => ({ from: m.is_staff ? "support" as const : "customer" as const, text: m.message, at: formatDateTime(m.created_at) })),
    order,
  });
}
