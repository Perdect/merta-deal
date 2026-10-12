import { StatusPill, type Tone } from "@/components/admin/kit";
import type { Enums } from "@/types/database";

/* Words + colour for the people/operations vocabularies (never colour alone). Server-safe. */

const STORE: Record<Enums<"store_status">, [string, Tone]> = { active: ["Active", "green"], pending: ["Pending review", "amber"], suspended: ["Suspended", "red"], closed: ["Closed", "neutral"] };
export function StoreStatusPill({ status }: { status: Enums<"store_status"> }) {
  const [label, tone] = STORE[status] ?? [status, "neutral"];
  return <StatusPill tone={tone}>{label}</StatusPill>;
}

const RIDER: Record<Enums<"rider_status">, [string, Tone]> = { active: ["Active", "green"], pending: ["Pending approval", "amber"], suspended: ["Suspended", "red"] };
export function RiderStatusPill({ status }: { status: Enums<"rider_status"> }) {
  const [label, tone] = RIDER[status] ?? [status, "neutral"];
  return <StatusPill tone={tone}>{label}</StatusPill>;
}

export const ROLE_LABEL: Record<Enums<"user_role">, string> = { customer: "Customer", store_owner: "Store owner", store_staff: "Store staff", rider: "Rider", admin: "Admin", super_admin: "Super admin" };
const ROLE_TONE: Record<Enums<"user_role">, Tone> = { customer: "neutral", store_owner: "green", store_staff: "green", rider: "blue", admin: "violet", super_admin: "violet" };
export function RolePill({ role }: { role: Enums<"user_role"> }) {
  return <StatusPill tone={ROLE_TONE[role] ?? "neutral"}>{ROLE_LABEL[role] ?? role}</StatusPill>;
}

export function ActivePill({ active, activeLabel = "Active", inactiveLabel = "Deactivated" }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return <StatusPill tone={active ? "green" : "red"}>{active ? activeLabel : inactiveLabel}</StatusPill>;
}

export function OnlinePill({ online }: { online: boolean }) {
  return <StatusPill tone={online ? "green" : "neutral"}>{online ? "Online" : "Offline"}</StatusPill>;
}

export const VEHICLE_LABEL: Record<Enums<"vehicle_type">, string> = { bicycle: "Bicycle", bike: "Bike", scooter: "Scooter", auto: "Auto", van: "Van" };
export const DOC_LABEL: Record<string, string> = { gst_certificate: "GST certificate", pan_card: "PAN card", fssai: "FSSAI licence", shop_license: "Shop licence", bank_proof: "Bank proof", owner_id: "Owner ID" };
