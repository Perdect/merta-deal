/**
 * Scheduled-delivery slots. The slot list ("HH:MM-HH:MM" strings), the lead time and the number of
 * days offered all come from the `settings` table; this only turns them into bookable windows.
 * Times are the customer's local time (the site serves one city, IST).
 */
export type SlotOption = { key: string; date: string; range: string; label: string; start: Date; end: Date; group: "Morning" | "Afternoon" | "Evening" };
export type SlotDay = { date: string; label: string; slots: SlotOption[] };

const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function hourLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = h % 24; const suffix = hh >= 12 ? "PM" : "AM"; const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return m ? `${h12}:${pad(m)} ${suffix}` : `${h12} ${suffix}`;
}
/** "15:00-17:00" → "3 – 5 PM" (suffix once when both halves share it). */
export function rangeLabel(range: string): string {
  const [a, b] = range.split("-");
  const la = hourLabel(a), lb = hourLabel(b);
  const sa = la.slice(-2), sb = lb.slice(-2);
  return sa === sb ? `${la.slice(0, -3)} – ${lb}` : `${la} – ${lb}`;
}
export function dayLabel(date: string, now = new Date()): string {
  const [y, m, d] = date.split("-").map(Number); const day = new Date(y, m - 1, d);
  const diff = Math.round((day.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  const pretty = day.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return diff === 0 ? `Today, ${pretty}` : diff === 1 ? `Tomorrow, ${pretty}` : day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/** The window for a slot on a date, in local time. */
export function slotWindow(date: string, range: string): { start: Date; end: Date } {
  const [y, m, d] = date.split("-").map(Number); const [a, b] = range.split("-");
  const mk = (t: string) => { const [h, mi] = t.split(":").map(Number); return new Date(y, m - 1, d, h, mi, 0, 0); };
  return { start: mk(a), end: mk(b) };
}

/** Bookable slots for the next `daysAhead` days: a slot must start at least `leadMinutes` from now. */
export function upcomingSlots(ranges: string[], opts: { leadMinutes: number; daysAhead: number; now?: Date }): SlotDay[] {
  const now = opts.now ?? new Date();
  const earliest = now.getTime() + opts.leadMinutes * 60000;
  const days: SlotDay[] = [];
  for (let i = 0; i < Math.max(1, opts.daysAhead); i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const date = dateKey(d);
    const slots = ranges.map((range) => {
      const { start, end } = slotWindow(date, range);
      const h = start.getHours();
      const group: SlotOption["group"] = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
      return { key: `${date}|${range}`, date, range, label: rangeLabel(range), start, end, group };
    }).filter((s) => s.start.getTime() >= earliest);
    days.push({ date, label: dayLabel(date, now), slots });
  }
  return days;
}

export function parseSlotKey(key: string | null | undefined): { date: string; range: string } | null {
  if (!key) return null; const [date, range] = key.split("|");
  return date && range ? { date, range } : null;
}
/** "Today, 10 Nov · 3 – 5 PM" for a chosen slot key. */
export function slotSummary(key: string | null | undefined, now = new Date()): string | null {
  const p = parseSlotKey(key); return p ? `${dayLabel(p.date, now)} · ${rangeLabel(p.range)}` : null;
}

/** Opening hours from the `business_hours` setting ("HH:MM", close may be "24:00"). */
export type OpenHours = { open: string; close: string };
/**
 * When the shop is closed by the clock (India time), the label of the time it opens next ("6 AM");
 * null while it is within hours, or when the hours are missing or malformed. It says nothing about
 * ordering being switched off or the shop being at capacity: callers use it only to explain "closed".
 */
export function opensAtIfClosed(hours: OpenHours | null | undefined, now = new Date()): string | null {
  if (!hours || !/^\d{1,2}:\d{2}$/.test(hours.open ?? "") || !/^\d{1,2}:\d{2}$/.test(hours.close ?? "")) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const mins = (Number(parts.find((x) => x.type === "hour")?.value ?? 0) % 24) * 60 + Number(parts.find((x) => x.type === "minute")?.value ?? 0);
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const open = toMin(hours.open), close = toMin(hours.close);
  const within = open < close ? mins >= open && mins < close : open > close ? mins >= open || mins < close : true;
  return within ? null : hourLabel(hours.open);
}
