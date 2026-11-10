import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

export type RiderApplication = {
  id: string; full_name: string; phone: string; email: string; vehicle_type: Enums<"vehicle_type">; vehicle_number: string | null; license_number: string | null;
  aadhaar_last4: string | null; emergency_contact: string | null; note: string | null; status: "new" | "created" | "declined";
  review_note: string | null; reviewed_at: string | null; reviewer_name: string | null; created_user_id: string | null; created_at: string;
};
type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

/** Delivery partner applications for the admin Riders page (0047). Returns [] when the migration is not applied. */
export const getRiderApplications = cache(async (status: "new" | "declined" | "created" | null = "new"): Promise<RiderApplication[]> => {
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)("admin_rider_applications", { p_status: status });
  if (error) return [];
  return (data as RiderApplication[] | null) ?? [];
});
