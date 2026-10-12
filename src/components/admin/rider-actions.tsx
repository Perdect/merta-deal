"use client";
import * as React from "react";
import { Ban, CheckCircle2, Pencil, RotateCcw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { SidePanel, useUnsavedChanges } from "@/components/admin/kit";
import { ConfirmChange, FieldGroup, FormErrorSummary, PanelFormFooter, useRunAction } from "@/components/admin/ops/shared";
import { VEHICLE_OPTIONS } from "@/components/admin/constants";
import { setRiderStatusAction, updateRiderAdminAction } from "@/lib/actions/admin";
import type { RiderRow, CityRow } from "@/lib/data/admin";
import type { Enums } from "@/types/database";
import { cn } from "@/lib/utils";

type RiderStatus = Enums<"rider_status">;
type Transition = { to: RiderStatus; label: string; icon: LucideIcon; danger?: boolean; primary?: boolean };

/** Only transitions that make sense from the current status are offered. */
const TRANSITIONS: Record<RiderStatus, Transition[]> = {
  pending: [{ to: "active", label: "Approve", icon: CheckCircle2, primary: true }, { to: "suspended", label: "Suspend", icon: Ban, danger: true }],
  active: [{ to: "suspended", label: "Suspend", icon: Ban, danger: true }, { to: "pending", label: "Back to pending", icon: RotateCcw }],
  suspended: [{ to: "active", label: "Reinstate", icon: CheckCircle2, primary: true }],
};

function copyFor(from: RiderStatus, to: RiderStatus, name: string) {
  if (to === "active") return { title: from === "pending" ? `Approve ${name}?` : `Reinstate ${name}?`, body: "The rider can go online and receive delivery offers straight away. They are notified in the app.", ok: from === "pending" ? "Approve rider" : "Reinstate rider", ack: from === "pending" ? "Rider approved" : "Rider reinstated" };
  if (to === "suspended") return { title: `Suspend ${name}?`, body: "The rider is taken offline immediately and can't accept new deliveries. A delivery they have already accepted stays with them until it is finished. They are notified with your reason.", ok: "Suspend rider", ack: "Rider suspended" };
  return { title: `Move ${name} back to pending?`, body: "The rider is taken offline and can't receive offers until approved again. They are notified in the app.", ok: "Move to pending", ack: "Rider moved to pending" };
}

/** Approve / suspend / reinstate buttons (quick view + detail). Every change is confirmed. */
export function RiderStatusActions({ rider, name, size = "sm", className }: { rider: Pick<RiderRow, "id" | "status">; name: string; size?: "xs" | "sm"; className?: string }) {
  const { busy, run } = useRunAction();
  const [target, setTarget] = React.useState<RiderStatus | null>(null);
  const copy = target ? copyFor(rider.status, target, name) : null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {TRANSITIONS[rider.status].map((t) => (
        <Button key={t.to} size={size} variant={t.primary ? "primary" : "outline"} className={t.danger ? "text-danger hover:bg-danger-50" : undefined} onClick={() => setTarget(t.to)}>
          <t.icon className="h-4 w-4" aria-hidden />{t.label}
        </Button>
      ))}
      <ConfirmChange open={Boolean(target)} onClose={() => setTarget(null)} title={copy?.title ?? ""} description={copy?.body} confirmLabel={copy?.ok ?? "Confirm"}
        tone={target === "suspended" ? "danger" : "primary"} loading={busy === "status"}
        note={target === "suspended" ? { label: "Reason sent to the rider", placeholder: "e.g. Repeated late deliveries — please contact support.", required: true } : undefined}
        onConfirm={async (note) => { if (!target) return; const r = await run("status", () => setRiderStatusAction(rider.id, target, note || undefined), copy!.ack, "The rider has been notified."); if (r.ok) setTarget(null); }} />
    </div>
  );
}

type EditForm = { vehicle_type: Enums<"vehicle_type">; vehicle_number: string; license_number: string; city_id: string; emergency_contact: string };

function validate(f: EditForm) {
  const e: Partial<Record<keyof EditForm, string>> = {};
  if (f.vehicle_number && !/^[A-Z0-9 -]{4,15}$/.test(f.vehicle_number)) e.vehicle_number = "Vehicle number: 4–15 letters or digits, e.g. RJ21SA1234.";
  if (f.license_number && f.license_number.trim().length > 30) e.license_number = "Licence number is too long (30 characters max).";
  if (f.emergency_contact) { const digits = f.emergency_contact.replace(/\D/g, ""); if (digits.length < 10) e.emergency_contact = "Emergency contact needs a 10-digit phone number."; }
  return e;
}

/** "Edit details" button + side panel form for vehicle, licence, city and emergency contact. */
export function RiderEditPanel({ rider, cities, name }: { rider: RiderRow; cities: CityRow[]; name: string }) {
  const { busy, run } = useRunAction();
  const initial = React.useMemo<EditForm>(() => ({ vehicle_type: rider.vehicle_type, vehicle_number: rider.vehicle_number ?? "", license_number: rider.license_number ?? "", city_id: rider.city_id ?? "", emergency_contact: rider.emergency_contact ?? "" }), [rider]);
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState(initial);
  const [submitted, setSubmitted] = React.useState(false);
  const dirty = open && (Object.keys(f) as (keyof EditForm)[]).some((k) => f[k] !== initial[k]);
  const confirmDiscard = useUnsavedChanges(dirty);
  const errors = submitted ? validate(f) : {};
  const close = () => { if (!confirmDiscard()) return; setOpen(false); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitted(true);
    if (Object.keys(validate(f)).length) return;
    const r = await run("save", () => updateRiderAdminAction(rider.id, { vehicle_type: f.vehicle_type, vehicle_number: f.vehicle_number.trim() || null, license_number: f.license_number.trim() || null, city_id: f.city_id || null, emergency_contact: f.emergency_contact.trim() || null }), "Rider details saved");
    if (r.ok) { setOpen(false); setSubmitted(false); }
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setF(initial); setSubmitted(false); setOpen(true); }}><Pencil className="h-4 w-4" aria-hidden />Edit details</Button>
      <SidePanel open={open} onClose={close} title="Edit rider details" description={name} width="sm"
        footer={<PanelFormFooter formId="rider-edit" dirty={dirty} saving={busy === "save"} onCancel={close} />}>
        <form id="rider-edit" noValidate onSubmit={save} className="space-y-5">
          {submitted ? <FormErrorSummary errors={errors} /> : null}
          <FieldGroup title="Vehicle">
            <Select label="Vehicle type" options={VEHICLE_OPTIONS} value={f.vehicle_type} onChange={(e) => setF({ ...f, vehicle_type: e.target.value as Enums<"vehicle_type"> })} />
            <Input label="Vehicle number" value={f.vehicle_number} onChange={(e) => setF({ ...f, vehicle_number: e.target.value.toUpperCase() })} placeholder="RJ21SA1234" error={errors.vehicle_number} autoComplete="off" />
            <Input label="Driving licence number" value={f.license_number} onChange={(e) => setF({ ...f, license_number: e.target.value })} error={errors.license_number} autoComplete="off" />
          </FieldGroup>
          <FieldGroup title="Area & safety">
            <Select label="City" placeholder="Any city" options={cities.map((c) => ({ value: c.id, label: c.is_active ? c.name : `${c.name} (not live)` }))} value={f.city_id} onChange={(e) => setF({ ...f, city_id: e.target.value })} />
            <Input label="Emergency contact" value={f.emergency_contact} onChange={(e) => setF({ ...f, emergency_contact: e.target.value })} placeholder="Name and 10-digit phone" error={errors.emergency_contact} />
          </FieldGroup>
        </form>
      </SidePanel>
    </>
  );
}
