import { cache } from "react";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import type { Address, Coupon, Notification, Profile } from "@/types/app";

export const getMyProfile = cache(async (): Promise<Profile | null> => {
  const [supabase, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile) ?? null;
});

export const getMyAddresses = cache(async (): Promise<Address[]> => {
  const [supabase, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!user) return [];
  const { data } = await supabase.from("addresses").select("*").eq("user_id", user.id).order("is_default", { ascending: false }).order("created_at");
  return (data ?? []) as Address[];
});

export const getMyNotifications = cache(async (limit = 50): Promise<{ items: Notification[]; unread: number }> => {
  const [supabase, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!user) return { items: [], unread: 0 };
  const [{ data }, { count }] = await Promise.all([
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
  ]);
  return { items: (data ?? []) as Notification[], unread: count ?? 0 };
});

export const getAvailableCoupons = cache(async (): Promise<Coupon[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("coupons").select("*").eq("is_active", true).order("created_at", { ascending: false });
  return (data ?? []) as Coupon[];
});

export const getWallet = cache(async () => {
  const [supabase, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!user) return { balance: 0, transactions: [] };
  const { data: profile } = await supabase.from("profiles").select("wallet_balance").eq("id", user.id).maybeSingle();
  const { data: txns } = await supabase.from("wallet_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  return { balance: Number(profile?.wallet_balance ?? 0), transactions: txns ?? [] };
});

export const getRewards = cache(async () => {
  const [supabase, user] = await Promise.all([createClient(), getAuthUser()]);
  const emptyReferralStats = { pending: 0, rewarded: 0, creditsAvailable: 0 };
  if (!user) return { points: 0, transactions: [], referralStats: emptyReferralStats };
  const { data: profile } = await supabase.from("profiles").select("reward_points, referral_code").eq("id", user.id).maybeSingle();
  const [{ data: txns }, { data: statsData }] = await Promise.all([
    supabase.from("reward_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.rpc("my_referral_stats" as never),
  ]);
  const s = statsData as unknown as { pending?: number; rewarded?: number; credits_available?: number } | null;
  const referralStats = s ? { pending: Number(s.pending ?? 0), rewarded: Number(s.rewarded ?? 0), creditsAvailable: Number(s.credits_available ?? 0) } : emptyReferralStats;
  return { points: Number(profile?.reward_points ?? 0), referralCode: profile?.referral_code ?? null, transactions: txns ?? [], referralStats };
});

export const getMyTickets = cache(async () => {
  const [supabase, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!user) return [];
  const { data } = await supabase.from("support_tickets").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  return data ?? [];
});

export const getTicket = cache(async (id: string) => {
  const supabase = await createClient();
  const { data: ticket } = await supabase.from("support_tickets").select("*").eq("id", id).maybeSingle();
  if (!ticket) return null;
  const { data: messages } = await supabase.from("support_messages").select("*").eq("ticket_id", id).order("created_at");
  return { ticket, messages: messages ?? [] };
});
