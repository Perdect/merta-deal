import { Skeleton } from "@/components/ui/states";

export default function AdminLoading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="Loading">
      <div className="flex items-center justify-between"><Skeleton className="h-7 w-48" /><Skeleton className="h-9 w-28" /></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
    </div>
  );
}
