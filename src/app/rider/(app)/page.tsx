import type { Metadata } from "next";
import { getRiderAssignments, getRiderStats } from "@/lib/data/rider";
import { RiderHome } from "@/components/rider/rider-home";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

/**
 * `?a=<assignment id>` is how a notification opens the app at one delivery. The id is only a pointer: what
 * is shown comes from `rider_assignments()` for the signed-in rider, so a link to someone else's delivery,
 * or to one that has closed, shows nothing of it. A signed-out rider is sent to the rider sign-in by the
 * proxy with this address as `next`, and lands back here afterwards.
 */
export default async function RiderHomePage({ searchParams }: { searchParams: Promise<{ a?: string | string[] }> }) {
  const sp = await searchParams;
  const a = typeof sp.a === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sp.a) ? sp.a.toLowerCase() : null;
  const [stats, offers, active] = await Promise.all([getRiderStats(), getRiderAssignments(["offered"]), getRiderAssignments(["accepted", "picked_up"])]);
  return <RiderHome initial={{ stats, offers, active }} focus={a} />;
}
