import type { Metadata } from "next";
import { getMyRiderProfile, getRiderAssignments } from "@/lib/data/rider";
import { EarningsView } from "@/components/rider/earnings-view";
import { RiderText } from "@/components/rider/rider-text";
import { ErrorState } from "@/components/ui/states";
import { PayoutStatus, type EarningRow, type RiderPayoutRow } from "@/components/rider/payout-status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Earnings" };
export const dynamic = "force-dynamic";

export default async function RiderEarningsPage() {
  const supabase = await createClient();
  const [rider, delivered, earn, pay] = await Promise.all([
    getMyRiderProfile(), getRiderAssignments(["delivered"]),
    supabase.from("rider_earnings" as never).select("amount, status, created_at, confirmed_via, kind, note, breakdown, order:orders(order_number)").order("created_at", { ascending: false }).limit(50),
    supabase.from("rider_payouts" as never).select("amount, gross_amount, cod_offset, status, reference_no, failure_reason, created_at, settled_at").order("created_at", { ascending: false }).limit(10),
  ]);
  if (!rider) return <ErrorState title="Rider profile not found" retryHref="/rider" />;
  return (
    <div>
      <RiderText k="nav.earnings" as="h1" />
      <EarningsView delivered={delivered} rider={rider} />
      <div className="mt-4"><PayoutStatus earnings={(earn.data ?? []) as unknown as EarningRow[]} payouts={(pay.data ?? []) as unknown as RiderPayoutRow[]} /></div>
    </div>
  );
}
