import { LoadingState, Skeleton } from "@/components/ui";

export default function DeliveriesLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-11 w-full rounded-full" />
      <LoadingState rows={4} className="p-0" />
    </div>
  );
}
