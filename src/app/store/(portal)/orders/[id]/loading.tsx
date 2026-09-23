import { LoadingState, Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <LoadingState rows={4} />
    </div>
  );
}
