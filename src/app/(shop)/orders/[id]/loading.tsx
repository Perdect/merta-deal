import { Skeleton } from "@/components/ui/states";

/**
 * The tracking screen's own skeleton, in the shape of what is coming: the status card, the rider, the
 * map, the address. Without it the shop's default skeleton — a banner and a product grid — flashed
 * before an order, which read as the wrong page loading.
 */
export default function OrderLoading() {
  return (
    <div data-route-loading="" className="pt-1" role="status" aria-label="Loading your order" aria-busy>
      <div className="flex items-center gap-3 px-4 py-3 sm:px-0">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-6 w-36" />
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 sm:px-0 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5">
        <div className="space-y-3.5">
          <Skeleton className="h-[176px] rounded-3xl" />
          <Skeleton className="h-[76px] rounded-2xl" />
          <Skeleton className="h-[52vh] max-h-[480px] min-h-[320px] rounded-2xl lg:h-[420px]" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <div className="space-y-3.5">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      </div>
      <p className="sr-only">Loading your order…</p>
    </div>
  );
}
