import type { Metadata } from "next";
import { TrackByCode } from "@/components/shop/track-by-code";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Track an order", description: "Track your Merta Deal order with the order number and mobile number — no login needed.", robots: { index: false, follow: true } };

export default function TrackPage() {
  return <div className="pt-1"><PageHeader title="Track an order" subtitle="Enter the order number from your confirmation and the mobile number used at checkout." /><TrackByCode /></div>;
}
