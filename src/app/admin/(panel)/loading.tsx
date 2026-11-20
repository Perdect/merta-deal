import { Skeleton } from "@/components/ui/states";

/** Route-level placeholder while a server page streams; real content replaces it (no endless spinners). */
export default function AdminLoading() {
  return (
    <div data-route-loading="" role="status" aria-live="polite" aria-label="Loading">
      <div className="mb-5 space-y-2"><Skeleton className="h-7 w-48 rounded-lg" /><Skeleton className="h-4 w-80 max-w-full rounded-lg" /></div>
      <div className="mb-3 flex gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-20 rounded-lg" />)}</div>
      <div className="mb-3 flex gap-2"><Skeleton className="h-9 w-72 max-w-full rounded-lg" /><Skeleton className="ml-auto h-9 w-24 rounded-lg" /></div>
      <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
        <Skeleton className="h-10 w-full rounded-none" />
        <div className="divide-y divide-line">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="flex items-center gap-4 px-4 py-3"><Skeleton className="h-4 w-28 rounded" /><Skeleton className="h-4 flex-1 rounded" /><Skeleton className="h-5 w-20 rounded-full" /><Skeleton className="h-4 w-16 rounded" /></div>)}</div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
