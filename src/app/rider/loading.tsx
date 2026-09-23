import { LoadingState, Skeleton } from "@/components/ui";

export default function RiderLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
      <LoadingState rows={2} className="p-0" />
    </div>
  );
}
