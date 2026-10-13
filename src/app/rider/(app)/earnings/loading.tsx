import { Skeleton } from "@/components/ui";

export default function EarningsLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-7 w-32" />
      <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      <Skeleton className="h-52 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}
