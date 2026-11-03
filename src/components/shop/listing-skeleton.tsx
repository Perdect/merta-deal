import { ProductGridSkeleton, Skeleton } from "@/components/ui/states";

/**
 * Shared skeleton for category and search listings. Mirrors the real layout (compact bar, optional
 * chips, Filters/Sort toolbar, count line, product grid) so the content replaces it in place.
 */
export function ListingSkeleton({ chips, search }: { chips?: boolean; search?: boolean }) {
  return (
    <div data-route-loading="" role="status" aria-label="Loading products" className="px-4 pt-1 sm:px-0">
      <div className="sticky top-0 z-30 -mx-4 mb-3 flex min-h-14 items-center gap-2 border-b border-line bg-card px-3 lg:hidden sm:mx-0">
        <Skeleton className="h-9 w-9 rounded-full" />
        {search ? <Skeleton className="h-11 flex-1 rounded-md" /> : <Skeleton className="h-4 w-1/2" />}
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
      {search ? <Skeleton className="mb-3 h-6 w-2/3" /> : null}
      {chips ? <div className="mb-3 flex gap-2 overflow-hidden">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-full" />)}</div> : null}
      <div className="mb-3 flex items-center gap-2"><Skeleton className="h-9 w-24 rounded-md" /><Skeleton className="h-9 w-24 rounded-md" /><Skeleton className="h-9 w-20 rounded-full" /></div>
      <Skeleton className="mb-3 h-3 w-20" />
      <ProductGridSkeleton count={6} />
    </div>
  );
}
