"use client";
import { Timer } from "lucide-react";
import { useLocationStore } from "@/stores/location-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { etaText } from "@/lib/eta";
import { cn } from "@/lib/utils";

/**
 * "⏱ 20 MINS" on a product card: the delivery zone's ETA for the customer's chosen location
 * (delivery_zones / settings, resolved by the location picker). Shown only for a location we
 * actually serve; with no location, or one outside the delivery area, the slot stays empty rather
 * than promising a time.
 */
export function EtaPill({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const location = useLocationStore((s) => s.location);
  const label = hydrated && location?.serviceable ? etaText(location.etaMin, location.etaMax) : null;
  if (!label) return <span className={cn("block h-5", className)} aria-hidden />;
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-md bg-surface-2 px-1.5 text-[10px] font-bold uppercase tracking-wide text-ink", className)} aria-label={`Delivery in ${label}`}>
      <Timer className="h-3 w-3 text-brand-700" strokeWidth={2.5} aria-hidden />{label}
    </span>
  );
}
