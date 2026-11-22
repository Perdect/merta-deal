import { Skeleton } from "@/components/ui/states";

const BLEED = "mx-[calc(50%_-_(100vw_-_var(--sbw,0px))/2)] w-[calc(100vw_-_var(--sbw,0px))] lg:mx-0 lg:w-auto";
const BAR = "rounded-full bg-white/25";

/**
 * The tracking screen's own skeleton, in the shape of what is coming: the green header with its four
 * steps, the map, then the payment, delivery partner, address, help and order summary cards. Without
 * it the shop's default skeleton — a banner and a product grid — flashed before an order, which read
 * as the wrong page loading.
 */
export default function OrderLoading() {
  return (
    <div data-route-loading="" className="lg:pt-4" role="status" aria-label="Loading your order" aria-busy>
      <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:px-0 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-5">
        <div className="max-lg:contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <div aria-hidden className={`${BLEED} rounded-b-[28px] bg-brand-700 px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)_+_10px)] lg:rounded-xl lg:px-6 lg:pb-6 lg:pt-6`}>
            <div className="flex items-center gap-3">
              <span className="h-11 w-11 shrink-0 rounded-full bg-white/15" />
              <span className="min-w-0 flex-1 space-y-2">
                <span className={`block h-3 w-28 ${BAR}`} />
                <span className={`block h-6 w-52 max-w-full ${BAR}`} />
              </span>
            </div>
            <span className={`ml-14 mt-3 block h-3 w-24 ${BAR}`} />
            <div className="mt-4 grid grid-cols-4 gap-1.5">
              {[0, 1, 2, 3].map((i) => <span key={i} className="space-y-1.5"><span className={`block h-1.5 ${BAR}`} /><span className={`block h-2.5 w-12 ${BAR}`} /></span>)}
            </div>
            <div className="mt-3.5 flex items-center justify-between">
              <span className={`block h-3 w-32 ${BAR}`} />
              <span className={`block h-6 w-24 ${BAR}`} />
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
            <Skeleton className="h-[34vh] max-h-[320px] min-h-[240px] rounded-none lg:h-[440px] lg:max-h-none" />
            <div className="flex items-center gap-3 p-4">
              <Skeleton className="h-11 w-11 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-44 max-w-full" /><Skeleton className="h-3 w-56 max-w-full" /></div>
            </div>
          </div>
          <Skeleton className="hidden h-64 rounded-xl lg:block" />
        </div>
        <div className="max-lg:contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-card p-4 shadow-card">
              <Skeleton className="h-11 w-11 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-40 max-w-full" /><Skeleton className="h-3 w-52 max-w-full" /></div>
            </div>
          ))}
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-[136px] rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
      <p className="sr-only">Loading your order…</p>
    </div>
  );
}
