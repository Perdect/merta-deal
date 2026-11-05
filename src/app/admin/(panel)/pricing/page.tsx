import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/kit";
import { PriceEditor, type ScheduledRow, type HistoryRow } from "@/components/admin/finance/price-editor";

export const metadata: Metadata = { title: "Selling prices" };
export const dynamic = "force-dynamic";

/** Bulk and scheduled selling-price changes with a preview, plus the audit trail of every change. */
export default async function PricingPage() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = supabase as any;
  const [cats, brands, canSee, sched, hist] = await Promise.all([
    supabase.from("categories").select("id, name, parent_id").eq("is_active", true).order("name"),
    supabase.from("brands").select("id, name").eq("is_active", true).order("name"),
    supabase.rpc("can_see_costs"),
    any.from("scheduled_price_changes").select("id, new_price, new_mrp, effective_at, status, reason, created_by_name, error, product:products(name, pack_label)").order("effective_at", { ascending: false }).limit(40),
    any.from("price_history").select("id, old_price, new_price, below_cost, reason, changed_by_name, created_at, product:products(name, pack_label)").order("created_at", { ascending: false }).limit(40),
  ]);
  type P = { product: { name: string; pack_label: string | null } | null };
  const scheduled: ScheduledRow[] = ((sched.data ?? []) as (Omit<ScheduledRow, "product_name" | "pack_label"> & P)[]).map((r) => ({ ...r, product_name: r.product?.name ?? "Product", pack_label: r.product?.pack_label ?? null }));
  const history: HistoryRow[] = ((hist.data ?? []) as (Omit<HistoryRow, "product_name" | "pack_label"> & P)[]).map((r) => ({ ...r, product_name: r.product?.name ?? "Product", pack_label: r.product?.pack_label ?? null }));
  const categories = (cats.data ?? []).map((c) => ({ value: c.id, label: c.parent_id ? `  ${c.name}` : c.name }));
  return (
    <>
      <AdminPageHeader title="Selling prices" description="Each pack size has its own price: a 500 g bag is priced on its own, never assumed to be half the 1 kg price. Every change is recorded with who and why; a price under cost needs an explicit confirmation." />
      <PriceEditor categories={categories} brands={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))} canSeeCosts={Boolean(canSee.data)} scheduled={scheduled} history={history} />
    </>
  );
}
