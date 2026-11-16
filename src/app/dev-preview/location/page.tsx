import { notFound } from "next/navigation";
import { LocationPreview } from "./preview";

/** Development only: the address wizard in the same full-screen frame production uses, so the
 *  "Select Your Location" map step can be checked without a signed-in account or a saved address. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LocationPreview />;
}
