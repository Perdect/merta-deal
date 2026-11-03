import { Skeleton } from "@/components/ui/states";

/**
 * Product page while it loads: the same bar, square photo, info card and buy bar as the real page,
 * so the viewport does not move when the content arrives.
 */
export default function Loading() {
  return (
    <div data-route-loading="" role="status" aria-label="Loading product" className="pb-24 md:pb-0 md:pt-2">
      <div className="sticky top-0 z-30 mb-3 flex min-h-14 items-center gap-2 border-b border-line bg-card px-3 lg:hidden"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 w-1/2" /></div>
      <div className="md:grid md:grid-cols-[1.05fr_1fr] md:items-start md:gap-8">
        <Skeleton className="aspect-square w-full rounded-none bg-white md:rounded-2xl" />
        <div className="relative -mt-6 rounded-t-[28px] bg-card px-4 pb-5 pt-5 md:mt-0 md:rounded-2xl md:border md:border-line md:p-6">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-3 h-6 w-4/5" />
          <Skeleton className="mt-2 h-4 w-1/3" />
          <Skeleton className="mt-4 h-7 w-24 rounded-md" />
          <Skeleton className="mt-5 h-8 w-28" />
          <Skeleton className="mt-2 h-4 w-40" />
          <Skeleton className="mt-5 h-14 w-full rounded-xl" />
        </div>
      </div>
      <div className="mt-4 space-y-4 px-4 sm:px-0">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    </div>
  );
}
