"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { VEHICLE_OPTIONS } from "@/components/admin/constants";
import { setRiderStatusAction, updateRiderAdminAction } from "@/lib/actions/admin";
import type { RiderRow, CityRow } from "@/lib/data/admin";
import type { Enums } from "@/types/database";

/** Approve / suspend buttons (list + detail). */
export function RiderStatusButtons({ rider, size = "sm" }: { rider: Pick<RiderRow, "id" | "status">; size?: "xs" | "sm" }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [suspend, setSuspend] = React.useState(false);
  const [note, setNote] = React.useState("");
  const run = async (status: Enums<"rider_status">, n?: string) => { setBusy(true); const r = await setRiderStatusAction(rider.id, status, n); setBusy(false); if (r.ok) { toast.success(status === "active" ? "Rider approved" : status === "suspended" ? "Rider suspended" : "Rider set to pending"); setSuspend(false); router.refresh(); } else toast.error(r.error); };
  return (
    <span className="inline-flex gap-1.5">
      {rider.status !== "active" ? <Button size={size} loading={busy} onClick={() => run("active")}><CheckCircle2 className="h-4 w-4" /> {rider.status === "suspended" ? "Reinstate" : "Approve"}</Button> : null}
      {rider.status !== "suspended" ? <Button size={size} variant="outline" className="text-danger" onClick={() => setSuspend(true)}><Ban className="h-4 w-4" /> Suspend</Button> : null}
      {rider.status === "active" ? <Button size={size} variant="ghost" loading={busy} onClick={() => run("pending")}><RotateCcw className="h-4 w-4" /> Back to pending</Button> : null}
      <Modal open={suspend} onClose={() => setSuspend(false)} title="Suspend rider" size="sm" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setSuspend(false)}>Cancel</Button><Button variant="danger" fullWidth loading={busy} onClick={() => run("suspended", note)}>Suspend</Button></div>}>
        <p className="mb-3 text-sm text-ink-2">The rider is taken offline immediately and cannot accept deliveries. Any accepted delivery stays with them until finished.</p>
        <Textarea label="Reason (sent to the rider)" value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </span>
  );
}

export function RiderEditForm({ rider, cities }: { rider: RiderRow; cities: CityRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [f, setF] = React.useState({ vehicle_type: rider.vehicle_type, vehicle_number: rider.vehicle_number ?? "", license_number: rider.license_number ?? "", city_id: rider.city_id ?? "", emergency_contact: rider.emergency_contact ?? "" });
  const save = async () => { setBusy(true); const r = await updateRiderAdminAction(rider.id, { ...f, city_id: f.city_id || null }); setBusy(false); if (r.ok) { toast.success("Rider details saved"); router.refresh(); } else toast.error(r.error); };
  return (
    <div className="space-y-3">
      <Select label="Vehicle" options={VEHICLE_OPTIONS} value={f.vehicle_type} onChange={(e) => setF({ ...f, vehicle_type: e.target.value as Enums<"vehicle_type"> })} />
      <Input label="Vehicle number" value={f.vehicle_number} onChange={(e) => setF({ ...f, vehicle_number: e.target.value.toUpperCase() })} placeholder="RJ21SA1234" />
      <Input label="Licence number" value={f.license_number} onChange={(e) => setF({ ...f, license_number: e.target.value })} />
      <Select label="City" placeholder="Any city" options={cities.map((c) => ({ value: c.id, label: c.name }))} value={f.city_id} onChange={(e) => setF({ ...f, city_id: e.target.value })} />
      <Input label="Emergency contact" value={f.emergency_contact} onChange={(e) => setF({ ...f, emergency_contact: e.target.value })} />
      <Button size="sm" variant="secondary" loading={busy} onClick={save}>Save details</Button>
    </div>
  );
}
