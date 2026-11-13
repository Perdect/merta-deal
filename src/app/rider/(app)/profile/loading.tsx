import { Skeleton } from "@/components/ui";

/** Shapes of the profile sections while the rider row and notifications load. */
export default function RiderProfileLoading() {
  return (
    <div className="space-y-3" aria-busy>
      <Skeleton className="h-[128px] w-full rounded-[20px]" />
      <Skeleton className="h-[200px] w-full rounded-[20px]" />
      <Skeleton className="h-[220px] w-full rounded-[20px]" />
      <Skeleton className="h-[96px] w-full rounded-[20px]" />
      <Skeleton className="h-[72px] w-full rounded-[20px]" />
    </div>
  );
}
