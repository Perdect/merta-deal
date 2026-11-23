import { Skeleton } from "@/components/ui";

/** Shapes of the profile screen while the rider row and notifications load: who you are, alerts, the settings list. */
export default function RiderProfileLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-[136px] w-full rounded-[20px]" />
      <Skeleton className="h-[280px] w-full rounded-[20px]" />
      <Skeleton className="h-[448px] w-full rounded-[20px]" />
    </div>
  );
}
