import { ProductGridSkeleton, Skeleton } from "@/components/ui/states";

/** Mirrors the homepage layout (banner, offer, 3 categories, products) so nothing jumps when it loads. */
export default function Loading() {
  return (
    <div data-route-loading="" className="space-y-5 px-4 pt-3 sm:px-0 sm:pt-5" role="status" aria-label="Loading">
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="aspect-[4/4.2] rounded-2xl" />)}</div>
      <ProductGridSkeleton count={4} />
    </div>
  );
}
