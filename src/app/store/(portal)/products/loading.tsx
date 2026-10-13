import { Skeleton } from "@/components/ui/states";

/** Mirrors the products page layout so nothing jumps when data arrives. */
export default function Loading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading products">
      <div className="space-y-1.5"><Skeleton className="h-7 w-32" /><Skeleton className="h-4 w-24" /></div>
      <div className="flex gap-2"><Skeleton className="h-11 flex-1 rounded-sm" /><Skeleton className="h-11 w-24 rounded-sm lg:w-96" /></div>
      <div className="flex gap-2">{[64, 92, 100, 116].map((w) => <Skeleton key={w} className="h-11 rounded-full" style={{ width: w }} />)}</div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 min-[85rem]:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="space-y-3 rounded-lg border border-line bg-card p-4">
            <div className="flex gap-3"><Skeleton className="h-20 w-20 rounded-md" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-3 w-1/3" /></div></div>
            <Skeleton className="h-6 w-24" /><Skeleton className="h-11 w-full" />
            <div className="grid grid-cols-2 gap-2"><Skeleton className="h-11" /><Skeleton className="h-11" /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
