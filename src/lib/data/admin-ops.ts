import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE, pageRange, safeLike, type Paged, type ProfileRow, type RiderRow, type StoreListRow } from "@/lib/data/admin";
import type { Enums } from "@/types/database";

/* ================================================================================================
 * Read helpers for the Operations (stores, riders, delivery) and People (users) admin pages.
 * Lists are paged on the server; tab counts are head-only queries that honour search + filters.
 * Each list returns `error` so the page can show an ErrorBlock with Retry instead of "no rows".
 * ============================================================================================== */

export type PagedResult<T> = Paged<T> & { error: string | null };

// The query builders are generic PostgREST builders; a structural type keeps the helpers reusable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filterable = { eq: any; in: any; or: any; is: any; not: any };

/* ------------------------------------------------------------------------------------------------
 * Stores
 * ---------------------------------------------------------------------------------------------- */

export type StoreFilters = { q?: string; status?: string; open?: string; featured?: string; zone?: string };
export const STORE_TABS = ["", "active", "pending", "suspended", "closed"] as const;
const STORE_STATUSES = ["pending", "active", "suspended", "closed"];

function applyStoreFilters<Q extends Filterable>(query: Q, f: StoreFilters, withStatus = true): Q {
  let q = query;
  if (withStatus && f.status && STORE_STATUSES.includes(f.status)) q = q.eq("status", f.status as Enums<"store_status">);
  if (f.open === "1") q = q.eq("is_open", true);
  if (f.open === "0") q = q.eq("is_open", false);
  if (f.featured === "1") q = q.eq("is_featured", true);
  if (f.featured === "0") q = q.eq("is_featured", false);
  if (f.zone === "none") q = q.is("zone_id", null);
  else if (f.zone && /^[0-9a-f-]{36}$/.test(f.zone)) q = q.eq("zone_id", f.zone);
  if (f.q) { const like = safeLike(f.q); q = q.or(`name.ilike.${like},area.ilike.${like},phone.ilike.${like},owner_name.ilike.${like},slug.ilike.${like}`); }
  return q;
}

export type StoreOpsRow = StoreListRow & { zone_id: string | null };

export const listStoresOps = cache(async (f: StoreFilters & { page?: number }): Promise<PagedResult<StoreOpsRow>> => {
  const supabase = await createClient();
  const page = f.page ?? 1;
  const base = supabase.from("stores")
    .select("id, name, slug, area, phone, owner_name, status, is_open, is_featured, rating_avg, rating_count, total_orders, commission_rate, created_at, logo_url, zone_id", { count: "exact" })
    .order("created_at", { ascending: false }).range(...pageRange(page));
  const { data, count, error } = await applyStoreFilters(base, f);
  if (error) console.error("listStoresOps", error.message);
  return { items: (data ?? []) as StoreOpsRow[], total: count ?? 0, page, pageSize: PAGE_SIZE, error: error?.message ?? null };
});

export const countStoresByStatus = cache(async (f: StoreFilters): Promise<Record<string, number | null>> => {
  const supabase = await createClient();
  const res = await Promise.all(STORE_TABS.map(async (t) => {
    const { count, error } = await applyStoreFilters(supabase.from("stores").select("id", { count: "exact", head: true }), { ...f, status: t || undefined });
    return [t, error ? null : count ?? 0] as const;
  }));
  return Object.fromEntries(res);
});

/* ------------------------------------------------------------------------------------------------
 * Riders
 * ---------------------------------------------------------------------------------------------- */

export type RiderFilters = { q?: string; status?: string; online?: string; vehicle?: string };
export const RIDER_TABS = ["", "active", "pending", "suspended"] as const;
const RIDER_STATUSES = ["pending", "active", "suspended"];
const VEHICLES = ["bicycle", "bike", "scooter", "auto", "van"];

/** Rider names and phones live on profiles, so search resolves matching user ids first. */
const riderSearchUserIds = cache(async (q: string): Promise<string[]> => {
  if (!q) return [];
  const supabase = await createClient();
  const like = safeLike(q);
  const { data } = await supabase.from("profiles").select("id").or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`).limit(300);
  return (data ?? []).map((r) => r.id);
});

function applyRiderFilters<Q extends Filterable>(query: Q, f: RiderFilters, userIds: string[], withStatus = true): Q {
  let q = query;
  if (withStatus && f.status && RIDER_STATUSES.includes(f.status)) q = q.eq("status", f.status as Enums<"rider_status">);
  if (f.online === "1") q = q.eq("is_online", true);
  if (f.online === "0") q = q.eq("is_online", false);
  if (f.vehicle && VEHICLES.includes(f.vehicle)) q = q.eq("vehicle_type", f.vehicle as Enums<"vehicle_type">);
  if (f.q) {
    const like = safeLike(f.q);
    const parts = [`vehicle_number.ilike.${like}`, `license_number.ilike.${like}`];
    if (userIds.length) parts.push(`user_id.in.(${userIds.join(",")})`);
    q = q.or(parts.join(","));
  }
  return q;
}

export const listRidersOps = cache(async (f: RiderFilters & { page?: number }): Promise<PagedResult<RiderRow>> => {
  const supabase = await createClient();
  const page = f.page ?? 1;
  const ids = await riderSearchUserIds(f.q ?? "");
  const base = supabase.from("delivery_partners").select("*, user:profiles(full_name, phone, email, avatar_url, is_active)", { count: "exact" })
    .order("created_at", { ascending: false }).range(...pageRange(page));
  const { data, count, error } = await applyRiderFilters(base, f, ids);
  if (error) console.error("listRidersOps", error.message);
  return { items: (data ?? []) as unknown as RiderRow[], total: count ?? 0, page, pageSize: PAGE_SIZE, error: error?.message ?? null };
});

export const countRidersByStatus = cache(async (f: RiderFilters): Promise<Record<string, number | null>> => {
  const supabase = await createClient();
  const ids = await riderSearchUserIds(f.q ?? "");
  const res = await Promise.all(RIDER_TABS.map(async (t) => {
    const { count, error } = await applyRiderFilters(supabase.from("delivery_partners").select("id", { count: "exact", head: true }), { ...f, status: t || undefined }, ids);
    return [t, error ? null : count ?? 0] as const;
  }));
  return Object.fromEntries(res);
});

/* ------------------------------------------------------------------------------------------------
 * Users
 * ---------------------------------------------------------------------------------------------- */

export type UserFilters = { q?: string; role?: string; active?: string; guest?: string };
/** Role tabs; "admins" groups admin + super admin. A raw role value is also accepted. */
export const USER_ROLE_GROUPS: Record<string, Enums<"user_role">[]> = {
  customer: ["customer"], store_owner: ["store_owner"], store_staff: ["store_staff"], rider: ["rider"], admins: ["admin", "super_admin"], admin: ["admin"], super_admin: ["super_admin"],
};
export const USER_TABS = ["", "customer", "store_owner", "store_staff", "rider", "admins"] as const;

function applyUserFilters<Q extends Filterable>(query: Q, f: UserFilters, withRole = true): Q {
  let q = query;
  if (withRole && f.role && USER_ROLE_GROUPS[f.role]) q = q.in("role", USER_ROLE_GROUPS[f.role]);
  if (f.active === "1") q = q.eq("is_active", true);
  if (f.active === "0") q = q.eq("is_active", false);
  if (f.guest === "1") q = q.eq("is_guest", true);
  if (f.guest === "0") q = q.eq("is_guest", false);
  if (f.q) { const like = safeLike(f.q); q = q.or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like},referral_code.ilike.${like}`); }
  return q;
}

export const listUsersOps = cache(async (f: UserFilters & { page?: number }): Promise<PagedResult<ProfileRow>> => {
  const supabase = await createClient();
  const page = f.page ?? 1;
  const base = supabase.from("profiles").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  const { data, count, error } = await applyUserFilters(base, f);
  if (error) console.error("listUsersOps", error.message);
  return { items: (data ?? []) as ProfileRow[], total: count ?? 0, page, pageSize: PAGE_SIZE, error: error?.message ?? null };
});

export const countUsersByRole = cache(async (f: UserFilters): Promise<Record<string, number | null>> => {
  const supabase = await createClient();
  const res = await Promise.all(USER_TABS.map(async (t) => {
    const { count, error } = await applyUserFilters(supabase.from("profiles").select("id", { count: "exact", head: true }), { ...f, role: t || undefined });
    return [t, error ? null : count ?? 0] as const;
  }));
  return Object.fromEntries(res);
});

/* ------------------------------------------------------------------------------------------------
 * Shared
 * ---------------------------------------------------------------------------------------------- */

/** Rebuilds the current list URL (for Retry links and quick-view links that keep filters + page). */
export function listHref(path: string, sp: Record<string, string | string[] | undefined>, patch: Record<string, string | null> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) { const s = Array.isArray(v) ? v[0] : v; if (s) q.set(k, s); }
  for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") q.delete(k); else q.set(k, v); }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** The last `days` IST calendar dates (YYYY-MM-DD), oldest first. */
export function lastIstDays(days: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(now - i * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  }
  return out;
}
