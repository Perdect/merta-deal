import { createClient } from "@/lib/supabase/server";
import { REQUEST_STATUSES, type RequestDestination, type RequestKind, type RequestStatus, type RequestUrgency } from "@/lib/service-requests";

export type ServiceRequestRow = {
  id: string; request_number: string; kind: RequestKind; status: RequestStatus; customer_name: string; customer_phone: string; item_type: string; quantity: string | null; occasion: string | null;
  pickup_location: string | null; drop_location: string; destination: RequestDestination; place_name: string | null; place_detail: string | null; via_reception: boolean; recipient_name: string | null; recipient_phone: string | null; gift_message: string | null; context: string | null; preferred_at: string | null; urgency: RequestUrgency; notes: string | null; quoted_charge: number | null; admin_note: string | null; handled_at: string | null; created_at: string;
};

const PAGE_SIZE = 30;
export const REQUEST_TABS = [...REQUEST_STATUSES, "all"] as const;
type Result<T> = PromiseLike<{ data: T | null; error: { code?: string; message: string } | null; count?: number | null }>;
/** The table arrives with migration 0039 and is not in the generated types until they are regenerated. */
type Query = Result<ServiceRequestRow[]> & { select: (c: string, o?: { count?: "exact"; head?: boolean }) => Query; eq: (k: string, v: string) => Query; or: (f: string) => Query; order: (k: string, o: { ascending: boolean }) => Query; range: (a: number, b: number) => Query; maybeSingle: () => Result<ServiceRequestRow> };
async function table() { const supabase = await createClient(); return () => (supabase as unknown as { from: (t: string) => Query }).from("service_requests"); }

export async function listServiceRequests(f: { status: string; q: string; page: number }) {
  const from = await table();
  let query = from().select("*", { count: "exact" }).order("created_at", { ascending: false }).range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.status !== "all") query = query.eq("status", f.status);
  const term = f.q.replace(/[^\p{L}\p{N} -]/gu, "").trim();
  if (term) query = query.or(`request_number.ilike.%${term}%,customer_phone.ilike.%${term}%,customer_name.ilike.%${term}%`);
  const { data, error, count } = await query;
  if (error) console.error("service_requests", error.code, error.message);
  return { items: data ?? [], total: count ?? 0, page: f.page, pageSize: PAGE_SIZE, error: Boolean(error), notInstalled: error?.code === "PGRST205" || error?.code === "42P01" };
}

export async function countServiceRequests() {
  const from = await table();
  const counts = await Promise.all(REQUEST_TABS.map(async (s) => {
    const q = from().select("id", { count: "exact", head: true });
    const { count } = await (s === "all" ? q : q.eq("status", s));
    return [s, count ?? null] as const;
  }));
  return Object.fromEntries(counts) as Record<string, number | null>;
}

export async function getServiceRequest(id: string) {
  const from = await table();
  const { data } = await from().select("*").eq("id", id).maybeSingle();
  return data;
}
