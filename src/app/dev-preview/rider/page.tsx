import { notFound } from "next/navigation";
import { RiderPreview } from "./preview";

/** Development only: the rider screens with fixture data, so the design can be checked without a rider sign-in. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RiderPreview />;
}
