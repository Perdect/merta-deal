"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { updateServiceRequestAction } from "@/lib/actions/service-requests";
import { REQUEST_STATUSES, STATUS_LABEL, type RequestStatus } from "@/lib/service-requests";

/** Status, charge and internal note for one service request. */
export function RequestControls({ id, status, quotedCharge, note }: { id: string; status: RequestStatus; quotedCharge: number | null; note: string | null }) {
  const router = useRouter();
  const [s, setS] = React.useState<string>(status);
  const [charge, setCharge] = React.useState(quotedCharge != null ? String(quotedCharge) : "");
  const [n, setN] = React.useState(note ?? "");
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    if (busy) return;
    const value = charge.trim() ? Number(charge) : null;
    if (value != null && !Number.isFinite(value)) { toast.error("Enter the charge as a number"); return; }
    setBusy(true);
    try {
      const r = await updateServiceRequestAction({ id, status: s, quotedCharge: value, note: n.trim() || null });
      if (!r.ok) { toast.error("Not saved", r.error); return; }
      toast.success("Request updated"); router.refresh();
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <Select label="Status" options={REQUEST_STATUSES.map((v) => ({ value: v, label: STATUS_LABEL[v] }))} value={s} onChange={(e) => setS(e.target.value)} />
      <Input label="Charge told to the customer (₹)" type="number" inputMode="decimal" min={0} step="0.01" value={charge} onChange={(e) => setCharge(e.target.value)} />
      <Textarea label="Internal note" rows={3} value={n} onChange={(e) => setN(e.target.value)} maxLength={1000} hint="Only admins see this." />
      <Button onClick={save} loading={busy}>Save</Button>
    </div>
  );
}
