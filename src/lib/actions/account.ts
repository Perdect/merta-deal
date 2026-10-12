"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "./cart";
import type { Enums, Json } from "@/types/database";

export async function updateProfileAction(input: { full_name: string; phone: string; avatar_url?: string | null; email?: string | null; preferences?: Record<string, unknown> }): Promise<ActionResult> {
  // The phone is the sign-in identity: it is only changed through the OTP flow below, never here.
  const schema = z.object({ full_name: z.string().min(2, "Enter your name"), phone: z.string().regex(/^[6-9]\d{9}$/).or(z.literal("")), avatar_url: z.string().url().optional().nullable(), email: z.string().email("Enter a valid email address").optional().nullable().or(z.literal("")), preferences: z.record(z.string(), z.unknown()).optional() });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in" };
  const { phone, email, ...rest } = parsed.data;
  const patch = { ...rest, ...(phone ? { phone } : {}), ...(email !== undefined ? { email: email || null } : {}), preferences: parsed.data.preferences as Json | undefined };
  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/account");
  return { ok: true, data: undefined };
}

export async function toggleWishlistAction(productId: string): Promise<ActionResult<{ wished: boolean }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_wishlist", { p_product_id: productId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/account/wishlist");
  return { ok: true, data: { wished: Boolean(data) } };
}

export async function markNotificationsReadAction(ids?: string[]): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_ids: ids });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/account/notifications");
  return { ok: true, data: Number(data ?? 0) };
}

export async function cancelOrderAction(orderId: string, reason: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: reason || undefined });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/orders"); revalidatePath(`/orders/${orderId}`);
  return { ok: true, data: undefined };
}

export async function completeOrderAction(orderId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_order_completed", { p_order_id: orderId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, data: undefined };
}

export async function submitReviewAction(input: { orderId: string; target: Enums<"review_target">; rating: number; comment?: string; productId?: string; title?: string }): Promise<ActionResult<string>> {
  if (input.rating < 1 || input.rating > 5) return { ok: false, error: "Pick a rating between 1 and 5" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_review", { p_order_id: input.orderId, p_target: input.target, p_rating: input.rating, p_comment: input.comment || undefined, p_product_id: input.productId, p_title: input.title || undefined });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true, data: String(data) };
}

export async function createTicketAction(input: { subject: string; category: string; message: string; orderId?: string }): Promise<ActionResult<string>> {
  const schema = z.object({ subject: z.string().min(4, "Add a short subject"), category: z.string().min(2), message: z.string().min(10, "Describe the issue in a few words"), orderId: z.string().uuid().optional() });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in" };
  const { data: ticket, error } = await supabase.from("support_tickets").insert({ user_id: user.id, subject: parsed.data.subject, category: parsed.data.category, order_id: parsed.data.orderId ?? null, ticket_number: "" }).select("id").single();
  if (error) return { ok: false, error: friendlyError(error) };
  await supabase.from("support_messages").insert({ ticket_id: ticket.id, sender_id: user.id, message: parsed.data.message });
  revalidatePath("/account/support");
  return { ok: true, data: ticket.id };
}

export async function replyTicketAction(ticketId: string, message: string): Promise<ActionResult> {
  if (!message.trim()) return { ok: false, error: "Type a message" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in" };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaff = profile?.role === "admin" || profile?.role === "super_admin";
  const { error } = await supabase.from("support_messages").insert({ ticket_id: ticketId, sender_id: user.id, message: message.trim(), is_staff: isStaff });
  if (error) return { ok: false, error: friendlyError(error) };
  if (isStaff) await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", ticketId);
  revalidatePath(`/account/support/${ticketId}`); revalidatePath(`/admin/support/${ticketId}`);
  return { ok: true, data: undefined };
}

export async function savePushSubscriptionAction(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in" };
  const { error } = await supabase.from("push_subscriptions").upsert({ user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent ?? null }, { onConflict: "endpoint" });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: undefined };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: undefined };
}

/** Starts a mobile-number change: Supabase sends an OTP to the new number (needs the SMS provider). */
export async function requestPhoneChangeAction(mobile: string): Promise<ActionResult> {
  const m = mobile.replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(m)) return { ok: false, error: "Enter a valid 10-digit mobile number" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ phone: `+91${m}` });
  if (error) return { ok: false, error: /provider|sms|not enabled/i.test(error.message) ? "Changing your number needs SMS verification, which isn't switched on yet. Please contact support and we'll update it for you." : friendlyError(error) };
  return { ok: true, data: undefined };
}

/** Confirms the new number with the OTP, then mirrors it on the profile. */
export async function verifyPhoneChangeAction(mobile: string, token: string): Promise<ActionResult> {
  const m = mobile.replace(/\D/g, "").slice(-10);
  if (!/^\d{6}$/.test(token)) return { ok: false, error: "Enter the 6-digit code" };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone: `+91${m}`, token, type: "phone_change" });
  if (error) return { ok: false, error: friendlyError(error) };
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.from("profiles").update({ phone: m }).eq("id", user.id);
  revalidatePath("/account");
  return { ok: true, data: undefined };
}
