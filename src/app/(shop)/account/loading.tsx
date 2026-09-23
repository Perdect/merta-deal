import { Skeleton, LoadingState } from "@/components/ui/states";

export default function AccountLoading() {
  return (
    <div className="pt-1" aria-busy>
      <div className="flex items-center gap-3 px-4 py-3 sm:px-0">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-7 w-44" />
      </div>
      <div className="space-y-3 px-4 sm:px-0">
        <div className="rounded-lg border border-line bg-card p-4 shadow-card">
          <LoadingState rows={1} className="p-0" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <div className="rounded-lg border border-line bg-card shadow-card">
          <LoadingState rows={4} />
        </div>
      </div>
    </div>
  );
}
