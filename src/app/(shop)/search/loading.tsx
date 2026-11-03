import { ListingSkeleton } from "@/components/shop/listing-skeleton";

/** Search results while they load: search field, heading and a grid in the final layout. */
export default function Loading() {
  return <ListingSkeleton search />;
}
