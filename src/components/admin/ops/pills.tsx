import { StatusPill, type Tone } from "@/components/admin/kit";
import type { Enums } from "@/types/database";

/* Words + colour for the people/operations vocabularies (never colour alone). Server-safe. */

const RIDER: Record<Enums<"rider_status">, [string, Tone]> = { active: ["Active", "green"], pending: ["Pending approval", "amber"], suspended: ["Suspended", "red"] };
export function RiderStatusPill({ status }: { status: Enums<"rider_status"> }) {
  const [label, tone] = RIDER[status] ?? [status, "neutral"];
  return <StatusPill tone={tone}>{label}</StatusPill>;
}

export const ROLE_LABEL: Record<Enums<"user_role">, string> = { customer: "Customer", rider: "Rider", admin: "Admin", super_admin: "Super admin" };
const ROLE_TONE: Record<Enums<"user_role">, Tone> = { customer: "neutral", rider: "blue", admin: "violet", super_admin: "violet" };
export function RolePill({ role }: { role: Enums<"user_role"> }) {
  return <StatusPill tone={ROLE_TONE[role] ?? "neutral"}>{ROLE_LABEL[role] ?? role}</StatusPill>;
}

export function ActivePill({ active, activeLabel = "Active", inactiveLabel = "Deactivated" }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return <StatusPill tone={active ? "green" : "red"}>{active ? activeLabel : inactiveLabel}</StatusPill>;
}

export function OnlinePill({ online }: { online: boolean }) {
  return <StatusPill tone={online ? "green" : "neutral"}>{online ? "Online" : "Offline"}</StatusPill>;
}

/** What a rider is doing right now, from the assignment they hold and their online switch. */
export type RiderNow = { status: "offered" | "accepted" | "picked_up"; arrived_pickup_at?: string | null; arrived_customer_at?: string | null } | null | undefined;

export function riderNowLabel(online: boolean, now: RiderNow): { label: string; tone: Tone } {
  if (now?.status === "picked_up") return { label: now.arrived_customer_at ? "At the customer" : "Delivering", tone: "blue" };
  if (now?.status === "accepted") return { label: now.arrived_pickup_at ? "At the pickup point" : "Going to pickup", tone: "blue" };
  if (now?.status === "offered") return { label: "Offer waiting for an answer", tone: "amber" };
  return online ? { label: "Online · free", tone: "green" } : { label: "Offline", tone: "neutral" };
}

/** Availability in words plus colour: on a delivery (which step), an offer waiting, online and free, or offline. */
export function RiderNowPill({ online, now, className }: { online: boolean; now?: RiderNow; className?: string }) {
  const { label, tone } = riderNowLabel(online, now);
  return <StatusPill tone={tone} className={className}>{label}</StatusPill>;
}

export const VEHICLE_LABEL: Record<Enums<"vehicle_type">, string> = { bicycle: "Bicycle", bike: "Bike", scooter: "Scooter", auto: "Auto", van: "Van" };
