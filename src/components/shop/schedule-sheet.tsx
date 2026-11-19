"use client";
import * as React from "react";
import { Zap, CalendarDays, Sunrise, Sun, Sunset, Info } from "lucide-react";
import { BottomSheet } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { opensAtIfClosed, upcomingSlots, type OpenHours, type SlotOption } from "@/lib/slots";

export type ScheduleChoice = { type: "standard" } | { type: "scheduled"; key: string };
const GROUPS: { id: SlotOption["group"]; icon: React.ReactNode }[] = [
  { id: "Morning", icon: <Sunrise className="h-3.5 w-3.5" aria-hidden /> },
  { id: "Afternoon", icon: <Sun className="h-3.5 w-3.5" aria-hidden /> },
  { id: "Evening", icon: <Sunset className="h-3.5 w-3.5" aria-hidden /> },
];

/**
 * "Schedule your order": instant delivery or a slot on one of the next days. Slots, lead time and the
 * number of days come from settings; a slot is offered only if it still starts after the lead time.
 * Mount it fresh each time it opens (the parent renders it only while open) so the slot list reflects "now".
 */
export function ScheduleSheet({ onClose, ranges, leadMinutes, daysAhead, instantAvailable, etaLabel, itemCount, current, onConfirm, hours }: {
  onClose: () => void; ranges: string[]; leadMinutes: number; daysAhead: number;
  /** Opening hours (setting `business_hours`): lets a closed shop say when it opens instead of only "unavailable". */ hours?: OpenHours | null;
  /** False outside business hours: the instant tile is shown but cannot be chosen. */ instantAvailable: boolean;
  etaLabel: string | null; itemCount: number; current: ScheduleChoice; onConfirm: (c: ScheduleChoice) => void;
}) {
  const days = React.useMemo(() => upcomingSlots(ranges, { leadMinutes, daysAhead }), [ranges, leadMinutes, daysAhead]);
  const [mode, setMode] = React.useState<"instant" | "scheduled">(current.type === "scheduled" || !instantAvailable ? "scheduled" : "instant");
  const [key, setKey] = React.useState<string | null>(current.type === "scheduled" ? current.key : null);
  const [dayIdx, setDayIdx] = React.useState(() => {
    const fromKey = current.type === "scheduled" ? days.findIndex((d) => d.slots.some((s) => s.key === current.key)) : -1;
    return fromKey >= 0 ? fromKey : Math.max(0, days.findIndex((d) => d.slots.length > 0));
  });
  const day = days[dayIdx];
  const noSlots = days.every((d) => d.slots.length === 0);
  // Only a shop that is closed by the clock gets an opening time; switched off or at capacity stays "unavailable".
  const opensAt = instantAvailable ? null : opensAtIfClosed(hours);
  const canConfirm = mode === "instant" ? instantAvailable : Boolean(key && day?.slots.some((s) => s.key === key));

  return (
    <BottomSheet open onClose={onClose} title="Schedule your order" description={`${itemCount} item${itemCount === 1 ? "" : "s"}`}
      footer={
        <div className="space-y-2">
          <p className="flex items-center gap-2 rounded-xl bg-info-50 px-3 py-2 text-xs text-ink-2"><Info className="h-4 w-4 shrink-0 text-info" aria-hidden /> You can cancel a scheduled order any time before we start packing it.</p>
          <Button size="lg" fullWidth className="h-13 rounded-xl text-base" disabled={!canConfirm} onClick={() => onConfirm(mode === "instant" ? { type: "standard" } : { type: "scheduled", key: key! })}>Confirm</Button>
        </div>
      }>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={!instantAvailable} aria-pressed={mode === "instant"} onClick={() => setMode("instant")}
          className={cn("flex items-start justify-between rounded-xl border p-3 text-left disabled:cursor-not-allowed", mode === "instant" ? "border-brand-600 bg-brand-50" : "border-line bg-surface-2", !instantAvailable && "opacity-70")}>
          <span><span className="block text-sm font-bold text-ink">Instant Delivery</span><span className="block text-xs text-ink-3">{instantAvailable ? (etaLabel ? `In about ${etaLabel}` : "Right away") : opensAt ? `Closed now · opens ${opensAt}` : "Unavailable right now"}</span></span>
          <Zap className={cn("h-5 w-5", instantAvailable ? "text-brand-600" : "text-ink-4")} aria-hidden />
        </button>
        <button type="button" aria-pressed={mode === "scheduled"} onClick={() => setMode("scheduled")}
          className={cn("flex items-start justify-between rounded-xl border p-3 text-left", mode === "scheduled" ? "border-saffron-500 bg-saffron-50" : "border-line bg-surface-2")}>
          <span><span className="block text-sm font-bold text-ink">Schedule Delivery</span><span className="block text-xs text-ink-3">Select a slot</span></span>
          <CalendarDays className="h-5 w-5 text-saffron-600" aria-hidden />
        </button>
      </div>

      {mode === "scheduled" ? (
        <div className="mt-4">
          {noSlots ? <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-sm text-ink-3">{ranges.length === 0 ? "Scheduled delivery isn't available yet." : "No slots are open right now."}{opensAt ? ` You can order again from ${opensAt}.` : ranges.length === 0 ? "" : " Please check back later."}</p> : (
            <>
              <div className="grid gap-1 border-b border-line" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} role="tablist">
                {days.map((d, i) => (
                  <button key={d.date} type="button" role="tab" aria-selected={i === dayIdx} onClick={() => setDayIdx(i)} className={cn("-mb-px border-b-2 px-2 py-2 text-center", i === dayIdx ? "border-brand-600" : "border-transparent")}>
                    <span className={cn("block text-sm font-bold", i === dayIdx ? "text-brand-700" : "text-ink-2")}>{d.label}</span>
                    <span className="block text-[11px] text-ink-3">{d.slots.length} slot{d.slots.length === 1 ? "" : "s"}</span>
                  </button>
                ))}
              </div>
              {day && day.slots.length === 0 ? <p className="px-1 py-6 text-center text-sm text-ink-3">No more slots today. Pick a slot for tomorrow.</p> : null}
              {GROUPS.filter((g) => day?.slots.some((s) => s.group === g.id)).map((g) => (
                <section key={g.id} className="mt-4">
                  <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-3">{g.icon}{g.id}</h4>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {day!.slots.filter((s) => s.group === g.id).map((s) => (
                      <button key={s.key} type="button" aria-pressed={key === s.key} onClick={() => setKey(s.key)} className={cn("min-h-12 rounded-xl border px-2 py-2.5 text-sm font-semibold", key === s.key ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line bg-card text-ink")}>{s.label}</button>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      ) : null}
    </BottomSheet>
  );
}
