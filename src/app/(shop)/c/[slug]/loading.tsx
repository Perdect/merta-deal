import { ListingSkeleton } from "@/components/shop/listing-skeleton";

/** Category listing while its products load: bar, chips, toolbar and a grid in the final layout, so nothing jumps. */
export default function Loading() {
  return <ListingSkeleton chips />;
}
