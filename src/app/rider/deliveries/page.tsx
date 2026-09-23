import type { Metadata } from "next";
import { getRiderAssignments } from "@/lib/data/rider";
import { DeliveryHistory } from "@/components/rider/delivery-history";

export const metadata: Metadata = { title: "Deliveries" };
export const dynamic = "force-dynamic";

export default async function RiderDeliveriesPage() {
  const items = await getRiderAssignments(["delivered", "cancelled", "expired", "rejected"]);
  return (
    <div>
      <h1 className="mb-3 font-display text-xl font-extrabold text-ink">Deliveries</h1>
      <DeliveryHistory items={items} />
    </div>
  );
}
