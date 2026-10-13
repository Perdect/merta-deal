import type { Metadata } from "next";
import { getRiderAssignments, getRiderStats } from "@/lib/data/rider";
import { RiderHome } from "@/components/rider/rider-home";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

export default async function RiderHomePage() {
  const [stats, offers, active] = await Promise.all([getRiderStats(), getRiderAssignments(["offered"]), getRiderAssignments(["accepted", "picked_up"])]);
  return <RiderHome initial={{ stats, offers, active }} />;
}
