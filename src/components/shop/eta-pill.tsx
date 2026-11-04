"use client";
import { Timer } from "lucide-react";
import { useLocationStore } from "@/stores/location-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * "⏱ 20–25 MINS" on a product card. The number is the delivery zone's ETA for the customer's
 * location (delivery_zones / settings, resolved by the location picker), never typed in here; until
 * the location resolves it shows the city-wide window the settings copy mirrors.
 */
export function EtaPill({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const location = useLocationStore((s) => s.location);
  const label = hydrated && location?.etaMax ? `${location.etaMin ?? location.etaMax}–${location.etaMax} mins` : `${site.deliveryWindowShort.replace(/\s*min$/i, "")} mins`;
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-md bg-surface-2 px-1.5 text-[10px] font-bold uppercase tracking-wide text-ink", className)} aria-label={`Delivery in ${label}`}>
      <Timer className="h-3 w-3 text-brand-700" strokeWidth={2.5} aria-hidden />{label}
    </span>
  );
}
