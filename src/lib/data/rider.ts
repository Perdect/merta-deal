import { cache } from "react";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";
import type { DeliveryPartner, Notification, RiderAssignment, RiderStats } from "@/types/app";

export type AssignmentStatus = Enums<"assignment_status">;

/** The signed-in user's delivery_partners row (RLS: own row), or null when they never registered. */
export const getMyRiderProfile = cache(async (): Promise<DeliveryPartner | null> => {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return null;
  const { data } = await supabase.from("delivery_partners").select("*").eq("user_id", user.id).maybeSingle();
  return (data as DeliveryPartner | null) ?? null;
});

/** Dashboard numbers from `rider_dashboard_stats()`; null when the user is not a rider. */
export const getRiderStats = cache(async (): Promise<RiderStats | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rider_dashboard_stats");
  if (error || !data) return null;
  return data as unknown as RiderStats;
});

/** Assignments for the signed-in rider filtered by status. Also expires stale offers server-side. */
export async function getRiderAssignments(statuses: AssignmentStatus[]): Promise<RiderAssignment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rider_assignments", { p_status: statuses });
  if (error || !data) return [];
  return (data as unknown as RiderAssignment[]) ?? [];
}

/** True when the rider currently has an accepted / picked-up delivery (used to keep GPS streaming). */
export const hasActiveDelivery = cache(async (riderId: string): Promise<boolean> => {
  const supabase = await createClient();
  const { count } = await supabase.from("delivery_assignments").select("id", { count: "exact", head: true }).eq("rider_id", riderId).in("status", ["accepted", "picked_up"]);
  return (count ?? 0) > 0;
});

export const getRiderNotifications = cache(async (limit = 30): Promise<{ items: Notification[]; unread: number }> => {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { items: [], unread: 0 };
  const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit);
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false);
  return { items: (data ?? []) as Notification[], unread: count ?? 0 };
});
