/**
 * Headline delivery time, quick-commerce style: one figure ("20 mins"), the zone's minimum ETA from
 * `delivery_zones` / `settings`. The full window (min–max) is still what the order promise uses
 * (promised_at), so tracking shows the range; the headline never comes from copy or a default.
 */
export function etaMinutes(min?: number | null, max?: number | null): number | null {
  const m = min ?? max;
  return m && m > 0 ? m : null;
}

export function etaText(min?: number | null, max?: number | null, unit: "min" | "mins" | "minutes" = "mins"): string | null {
  const m = etaMinutes(min, max);
  return m ? `${m} ${unit}` : null;
}
