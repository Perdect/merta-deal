import Link from "next/link";
import { Clock, MapPin, Store as StoreIcon } from "lucide-react";
import type { NearbyStore } from "@/types/app";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/ui/misc";

export function StoreCard({ store, className, compact }: { store: NearbyStore; className?: string; compact?: boolean }) {
  return (
    <Link href={`/s/${store.slug}`} className={cn("flex gap-3 rounded-lg border border-line bg-card p-3 shadow-card transition-shadow hover:shadow-float", compact ? "w-[260px]" : "", className)}>
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-brand-50 text-brand-600">
        {store.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logo_url} alt="" className="h-full w-full object-cover" />
        ) : <StoreIcon className="h-6 w-6" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-bold text-ink">{store.name}</h3>
          <Badge tone={store.is_open ? "success" : "neutral"} size="xs">{store.is_open ? "Open" : "Closed"}</Badge>
        </div>
        {store.tagline ? <p className="line-clamp-1 text-xs text-ink-3">{store.tagline}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
          <StarRating value={store.rating_avg} count={store.rating_count} size={12} />
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{store.area} · {Number(store.distance_km).toFixed(1)} km</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{store.avg_prep_minutes} min prep</span>
        </div>
      </div>
    </Link>
  );
}
