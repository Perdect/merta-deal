import { ProductGridSkeleton, Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="space-y-6 px-4 pt-4 sm:px-0">
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}</div>
      <ProductGridSkeleton count={4} />
    </div>
  );
}
