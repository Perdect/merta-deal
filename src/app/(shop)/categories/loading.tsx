import { ListingSkeleton } from "@/components/shop/listing-skeleton";

/** Categories while it loads: the page bar, the category band and a grid, where the real ones will be. */
export default function Loading() {
  return <ListingSkeleton toolbar={false} />;
}
