import { ProductGridSkeleton, Skeleton } from "@/components/ui/states";

/**
 * Shared skeleton for category and search listings. Mirrors the real layout (compact bar, the category
 * band, the Filters/Sort toolbar, count line, product grid) so the content replaces it in place.
 */
export function ListingSkeleton({ search, toolbar = true }: { /** Kept for callers that still pass it; the band is always drawn. */ chips?: boolean; search?: boolean; /** The Categories screen has the band but no Filters/Sort row. */ toolbar?: boolean }) {
  return (
    <div data-route-loading="" role="status" aria-label="Loading products" className="px-4 pt-1 sm:px-0">
      <div className="sticky top-0 z-30 -mx-4 flex min-h-14 items-center gap-2 border-b border-line bg-card px-3 lg:hidden sm:mx-0">
        <Skeleton className="h-9 w-9 rounded-full" />
        {search ? <Skeleton className="h-11 flex-1 rounded-md" /> : <Skeleton className="h-4 w-1/2" />}
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
      <div className="-mx-4 flex items-end justify-around border-b-2 border-line-2 bg-surface-2/60 px-1 pb-2 pt-2.5 sm:mx-0 sm:justify-center sm:gap-10 sm:rounded-t-2xl lg:mt-3" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="flex flex-col items-center gap-1.5"><Skeleton className="h-8 w-10 rounded-lg" /><Skeleton className="h-2.5 w-14" /></div>)}
      </div>
      {search ? <Skeleton className="mt-3 h-6 w-2/3" /> : null}
      {toolbar ? (
        <>
          <div className="mb-2 flex items-center gap-2 overflow-hidden py-2"><Skeleton className="h-10 w-24 shrink-0 rounded-full" /><Skeleton className="h-10 w-20 shrink-0 rounded-full" /><Skeleton className="h-10 w-24 shrink-0 rounded-full" /><Skeleton className="h-10 w-24 shrink-0 rounded-full" /></div>
          <Skeleton className="mb-2.5 h-3 w-20" />
        </>
      ) : <div className="flex items-center justify-between py-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-16" /></div>}
      <ProductGridSkeleton count={6} />
    </div>
  );
}
