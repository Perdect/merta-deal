import { Skeleton } from "@/components/ui";

/** The home screen's shape while it loads: the one main card, then the small row for today. */
export default function RiderLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-[300px] w-full rounded-[24px]" />
      <Skeleton className="h-[68px] w-full rounded-2xl" />
    </div>
  );
}
