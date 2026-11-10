import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { AdminWholesaleOverview, MyWholesale, WholesaleCatalogueItem } from "@/lib/wholesale";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
const notInstalled = (e: { message: string; code?: string } | null) => Boolean(e && (e.code === "42883" || e.code === "PGRST202" || /could not find the function|does not exist/i.test(e.message)));

/** Public wholesale range with wholesale prices (a product on quote has none). */
export const getWholesaleCatalogue = cache(async (opts: { signedIn: boolean }): Promise<{ items: WholesaleCatalogueItem[]; installed: boolean }> => {
  const supabase = opts.signedIn ? await createClient() : createPublicClient();
  const { data, error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)("wholesale_catalogue");
  if (error) return { items: [], installed: !notInstalled(error) };
  return { items: (data as WholesaleCatalogueItem[] | null) ?? [], installed: true };
});

/** The signed-in customer's wholesale page data; `shop` is null until their first list or order. */
export const getMyWholesale = cache(async (): Promise<MyWholesale & { installed: boolean }> => {
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)("my_kirana_shop");
  if (error) return { shop: null, installed: !notInstalled(error) };
  return { ...((data as MyWholesale | null) ?? { shop: null }), installed: true };
});

export const getAdminWholesale = cache(async (): Promise<{ overview: AdminWholesaleOverview | null; installed: boolean; error: string | null }> => {
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)("admin_wholesale_overview");
  if (error) return { overview: null, installed: !notInstalled(error), error: error.message };
  return { overview: data as AdminWholesaleOverview, installed: true, error: null };
});
