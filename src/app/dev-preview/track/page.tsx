import { notFound } from "next/navigation";
import OrderLoading from "@/app/(shop)/orders/[id]/loading";
import { TrackPreview } from "./preview";

/**
 * Development only: the order tracking screen with fixture data, so the design and its awkward states
 * can be checked without placing an order. `?state=` picks one: on-the-way (default), stale, no-fix,
 * picking-up, packed, packing, placed, delivered, cancelled, offline, otp-locked, no-pin, and for the
 * payment card and the header: prepaid, late, upi-on-delivery. `loading` shows the route's skeleton.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  if (state === "loading") return <div className="mx-auto w-full max-w-6xl sm:px-6"><OrderLoading /></div>;
  return <TrackPreview state={state ?? "on-the-way"} />;
}
