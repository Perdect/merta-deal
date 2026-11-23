import type { Enums } from "@/types/database";
import type { RiderAssignment } from "@/types/app";
import type { BadgeTone } from "@/components/ui/badge";
import type { TKey } from "@/lib/rider-i18n-dict";

const IST = "Asia/Kolkata";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" });
const dayLabelFmt: Record<string, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" }),
  hi: new Intl.DateTimeFormat("hi-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" }),
};
const shortDayFmt: Record<string, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short" }),
  hi: new Intl.DateTimeFormat("hi-IN", { timeZone: IST, weekday: "short" }),
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` in Indian Standard Time — sortable and comparable as a string. */
export function istDayKey(value: string | number | Date): string {
  return dayKeyFmt.format(new Date(value));
}

/** Day key for `daysBack` days before now (IST has no DST, so a fixed 24h shift is exact). */
export function istDayKeyAgo(daysBack: number): string {
  return istDayKey(Date.now() - daysBack * DAY_MS);
}

/** Monday of the current IST week, as a day key. */
export function istWeekStartKey(): string {
  const wd = WEEKDAYS.indexOf(weekdayFmt.format(new Date()));
  const offset = (wd + 6) % 7; // Mon = 0 … Sun = 6
  return istDayKeyAgo(offset);
}

export function istMonthKey(): string {
  return istDayKey(Date.now()).slice(0, 7);
}

/** "Mon, 21 Sep" (or the Hindi form) for a day key; callers put "Today" / "Yesterday" in front where they want it. */
export function dayKeyLabel(key: string, lang: "en" | "hi" = "en"): string {
  return (dayLabelFmt[lang] ?? dayLabelFmt.en).format(new Date(`${key}T12:00:00+05:30`));
}

export function dayKeyWeekday(key: string, lang: "en" | "hi" = "en"): string {
  return (shortDayFmt[lang] ?? shortDayFmt.en).format(new Date(`${key}T12:00:00+05:30`));
}

/** The timestamp that best represents when an assignment "happened" for grouping. */
export function assignmentWhen(a: RiderAssignment): string {
  return a.delivered_at ?? a.picked_up_at ?? a.responded_at ?? a.offered_at;
}

/** Status label keys (translated with `useT`) and badge tones. */
export const ASSIGNMENT_META: Record<Enums<"assignment_status">, { label: TKey; tone: BadgeTone }> = {
  offered: { label: "assignment.offered", tone: "saffron" },
  accepted: { label: "assignment.accepted", tone: "info" },
  picked_up: { label: "assignment.pickedUp", tone: "info" },
  delivered: { label: "assignment.delivered", tone: "success" },
  rejected: { label: "assignment.rejected", tone: "neutral" },
  expired: { label: "assignment.expired", tone: "warning" },
  cancelled: { label: "assignment.cancelled", tone: "danger" },
};

export const VEHICLE_OPTIONS: { value: Enums<"vehicle_type">; label: string }[] = [
  { value: "bicycle", label: "Bicycle" },
  { value: "bike", label: "Motorbike" },
  { value: "scooter", label: "Scooter" },
  { value: "auto", label: "Auto rickshaw" },
  { value: "van", label: "Van / tempo" },
];

/** Google Maps directions deep link — works without an API key. */
export function navigateUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function formatKm(km: number | null | undefined) {
  if (km == null) return "—";
  return `${Number(km).toFixed(km >= 10 ? 0 : 1)} km`;
}

export function mmss(msLeft: number) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

type Snapshot = { full_name?: string; phone?: string; house?: string; street?: string; area?: string; landmark?: string | null; city?: string; pincode?: string; lat?: number | null; lng?: number | null };
const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** One-line address from the order's address snapshot. */
export function addressLine(address: RiderAssignment["order"]["address"] | null | undefined) {
  const a = (address ?? {}) as Snapshot;
  return [a.house, a.street, a.area, a.landmark ? `near ${a.landmark}` : null, a.pincode].filter(Boolean).join(", ");
}

/**
 * The same address as separate lines for a screen read outdoors: house and street, the area, the landmark
 * (worded by the caller, so it reads in the rider's language), then city and pincode. Empty parts are left out.
 */
export function addressLines(address: RiderAssignment["order"]["address"] | null | undefined, near: (landmark: string) => string): string[] {
  const a = (address ?? {}) as Snapshot;
  return [
    [clean(a.house), clean(a.street)].filter(Boolean).join(", "),
    clean(a.area),
    clean(a.landmark) ? near(clean(a.landmark)) : "",
    [clean(a.city), clean(a.pincode)].filter(Boolean).join(" "),
  ].filter(Boolean);
}

export function customerOf(a: RiderAssignment) {
  const s = (a.order.address ?? {}) as Snapshot;
  const lat = a.drop_lat ?? s.lat ?? null; const lng = a.drop_lng ?? s.lng ?? null;
  return { name: s.full_name ?? "Customer", phone: s.phone ?? null, area: s.area ?? "", point: lat != null && lng != null ? { lat, lng } : null };
}

/**
 * What an open request may show of where it goes. `rider_assignments()` gives an offered row only the area,
 * city and pincode of the address and the drop point rounded to about 100 m; the house, the name and the
 * phone arrive once the rider has accepted. A street or landmark is shown if the server ever sends one, and
 * the name, phone and house are never read here.
 */
export function requestDestination(a: RiderAssignment) {
  const s = (a.order.address ?? {}) as Snapshot;
  return {
    area: clean(s.area), street: clean(s.street), landmark: clean(s.landmark),
    place: [clean(s.city), clean(s.pincode)].filter(Boolean).join(" "),
    point: a.drop_lat != null && a.drop_lng != null ? { lat: Number(a.drop_lat), lng: Number(a.drop_lng) } : null,
  };
}

/** Google Maps opened at a point (no directions, no API key): used for a request's approximate drop area. */
export function mapPointUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
