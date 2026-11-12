import { Skeleton } from "@/components/ui";

export default function RiderLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-[76px] w-full rounded-lg" />
      <Skeleton className="h-44 w-full rounded-lg" />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-lg" />)}
      </div>
    </div>
  );
}
