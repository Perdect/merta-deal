import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { InventoryOverview, PassbookPage } from "@/lib/inventory";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
const notInstalled = (e: { message: string; code?: string } | null) => Boolean(e && (e.code === "42883" || e.code === "PGRST202" || /could not find the function|does not exist/i.test(e.message)));
const EMPTY: InventoryOverview = { rows: [], total: 0, counts: { all: 0, low: 0, out: 0, reserved: 0, paused: 0 }, totals: { available: 0, reserved: 0, physical: 0, low: 0, out: 0 } };

/** Stock per listing with available / reserved / physical, filtered and paged (0048). */
export const getInventoryOverview = cache(async (opts: { q?: string; category?: string; filter?: string; page?: number; pageSize?: number }): Promise<InventoryOverview & { installed: boolean; error: string | null }> => {
  const supabase = await createClient();
  const size = opts.pageSize ?? 25;
  const { data, error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)("admin_inventory_overview", {
    p_q: opts.q || null, p_category: opts.category || null, p_filter: opts.filter || null, p_limit: size, p_offset: ((opts.page ?? 1) - 1) * size,
  });
  if (error) return { ...EMPTY, installed: !notInstalled(error), error: error.message };
  return { ...((data as InventoryOverview | null) ?? EMPTY), installed: true, error: null };
});

/** Passbook entries, newest first; narrow to one listing or one kind. */
export const getInventoryPassbook = cache(async (opts: { inventoryId?: string; kind?: string; q?: string; page?: number; pageSize?: number }): Promise<PassbookPage & { error: string | null }> => {
  const supabase = await createClient();
  const size = opts.pageSize ?? 50;
  const { data, error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)("admin_inventory_passbook", {
    p_inventory_id: opts.inventoryId || null, p_kind: opts.kind || null, p_q: opts.q || null, p_limit: size, p_offset: ((opts.page ?? 1) - 1) * size,
  });
  if (error) return { rows: [], total: 0, error: error.message };
  return { ...((data as PassbookPage | null) ?? { rows: [], total: 0 }), error: null };
});
