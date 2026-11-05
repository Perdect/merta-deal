import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/kit";
import { RateCardEditor, type RateCardRow } from "@/components/admin/finance/rate-card-editor";

export const metadata: Metadata = { title: "Rider rates" };
export const dynamic = "force-dynamic";

export default async function RiderRatesPage() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = supabase as any;
  const [cards, zones, sup] = await Promise.all([
    any.from("rider_rate_cards").select("id, version, name, rules, is_active, note, created_by_name, created_at").order("version", { ascending: false }).limit(20),
    supabase.from("delivery_zones").select("id, name").eq("is_active", true).order("name"),
    supabase.rpc("is_super_admin"),
  ]);
  const versions = (cards.data ?? []) as RateCardRow[];
  return (
    <>
      <AdminPageHeader back="/admin/riders" title="Rider rates" description="What a rider earns per delivery. Each saved card is a new version; a delivery is paid on the version it was quoted with when the rider accepted." />
      <RateCardEditor active={versions.find((v) => v.is_active) ?? null} versions={versions} zones={zones.data ?? []} isSuper={Boolean(sup.data)} />
    </>
  );
}
