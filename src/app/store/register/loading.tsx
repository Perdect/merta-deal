import { LoadingState, Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <Skeleton className="h-8 w-56" />
      <LoadingState rows={6} />
    </div>
  );
}
