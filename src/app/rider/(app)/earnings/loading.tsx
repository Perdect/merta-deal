import { Skeleton } from "@/components/ui";

export default function EarningsLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-[132px] w-full rounded-[24px]" />
      <Skeleton className="h-[180px] w-full rounded-[20px]" />
      <Skeleton className="h-40 w-full rounded-[20px]" />
    </div>
  );
}
