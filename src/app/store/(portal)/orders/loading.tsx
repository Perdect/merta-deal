import { LoadingState, Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <LoadingState rows={5} />
    </div>
  );
}
