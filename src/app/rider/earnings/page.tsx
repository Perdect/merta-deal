import type { Metadata } from "next";
import { getMyRiderProfile, getRiderAssignments } from "@/lib/data/rider";
import { EarningsView } from "@/components/rider/earnings-view";
import { ErrorState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Earnings" };
export const dynamic = "force-dynamic";

export default async function RiderEarningsPage() {
  const [rider, delivered] = await Promise.all([getMyRiderProfile(), getRiderAssignments(["delivered"])]);
  if (!rider) return <ErrorState title="Rider profile not found" retryHref="/rider" />;
  return (
    <div>
      <h1 className="mb-3 font-display text-xl font-extrabold text-ink">Earnings</h1>
      <EarningsView delivered={delivered} rider={rider} />
    </div>
  );
}
