import { notFound } from "next/navigation";
import { RiderPreview } from "./preview";

/**
 * Development only: the rider screens with fixture data, so the design can be checked without a rider sign-in.
 * `?state=<key>` opens one screen. Motion is switched off here unless `?motion=1` is given: the preview pane
 * captures a hidden page, where an entry animation is never painted past its first frame.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ motion?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  return <RiderPreview still={sp.motion !== "1"} />;
}
