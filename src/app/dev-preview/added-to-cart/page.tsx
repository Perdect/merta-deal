import { notFound } from "next/navigation";
import { Preview } from "./preview";

/** Development only: the header's "Added to Cart" card with a fixture cart line, so it can be checked without adding to a real cart. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Preview />;
}
