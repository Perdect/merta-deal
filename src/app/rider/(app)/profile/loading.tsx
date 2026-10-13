import { Skeleton } from "@/components/ui";

export default function ProfileLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-80 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}
