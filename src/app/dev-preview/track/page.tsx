import { notFound } from "next/navigation";
import { TrackPreview } from "./preview";

/**
 * Development only: the order tracking screen with fixture data, so the design and its awkward states
 * can be checked without placing an order. `?state=` picks one: on-the-way (default), stale, no-fix,
 * picking-up, packed, packing, delivered, cancelled, offline, otp-locked, no-pin.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  return <TrackPreview state={state ?? "on-the-way"} />;
}
