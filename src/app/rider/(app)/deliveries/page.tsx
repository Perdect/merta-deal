import type { Metadata } from "next";
import { getRiderAssignments } from "@/lib/data/rider";
import { DeliveryHistory } from "@/components/rider/delivery-history";
import { RiderText } from "@/components/rider/rider-text";

export const metadata: Metadata = { title: "Deliveries" };
export const dynamic = "force-dynamic";

export default async function RiderDeliveriesPage() {
  const items = await getRiderAssignments(["delivered", "cancelled", "expired", "rejected"]);
  return (
    <div>
      <RiderText k="nav.deliveries" as="h1" />
      <DeliveryHistory items={items} />
    </div>
  );
}
