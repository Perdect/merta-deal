"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { Input, Select, Switch } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { btn } from "@/components/admin/care/shared";
import { VEHICLE_OPTIONS } from "@/components/admin/constants";
import { createRiderAction, updateRiderAction, deleteRiderAction } from "@/lib/actions/admin-riders";
import type { RiderRow, CityRow } from "@/lib/data/admin";
import type { Enums } from "@/types/database";
import { cn } from "@/lib/utils";

type Vehicle = Enums<"vehicle_type">;
type Form = { fullName: string; phone: string; vehicle_type: Vehicle; vehicle_number: string; license_number: string; city_id: string; emergency_contact: string };
const blank: Form = { fullName: "", phone: "", vehicle_type: "bike", vehicle_number: "", license_number: "", city_id: "", emergency_contact: "" };
const cityOptions = (cities: CityRow[]) => cities.map((c) => ({ value: c.id, label: c.is_active ? c.name : `${c.name} (not live)` }));

/** The fields shared by Add and Edit: who the rider is and what they ride. */
function RiderFields({ f, setF, cities }: { f: Form; setF: (f: Form) => void; cities: CityRow[] }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Full name" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoComplete="off" />
        <Input label="Mobile" required inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })} hint="Customers and the shop call this number." autoComplete="off" />
        <Select label="Vehicle" options={VEHICLE_OPTIONS} value={f.vehicle_type} onChange={(e) => setF({ ...f, vehicle_type: e.target.value as Vehicle })} />
        <Input label="Vehicle number" value={f.vehicle_number} onChange={(e) => setF({ ...f, vehicle_number: e.target.value.toUpperCase() })} placeholder="RJ21SA1234" autoComplete="off" />
        <Input label="Driving licence no." value={f.license_number} onChange={(e) => setF({ ...f, license_number: e.target.value })} autoComplete="off" />
        <Select label="City" placeholder="Any city" options={cityOptions(cities)} value={f.city_id} onChange={(e) => setF({ ...f, city_id: e.target.value })} />
      </div>
      <Input label="Emergency contact (optional)" value={f.emergency_contact} onChange={(e) => setF({ ...f, emergency_contact: e.target.value })} placeholder="Name and 10-digit phone" />
    </>
  );
}

/** Header button: create a rider with a sign-in, vehicle details, and optionally approved at once. */
export function AddRiderButton({ cities }: { cities: CityRow[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [showPw, setShowPw] = React.useState(false);
  const [f, setF] = React.useState<Form>(blank);
  const [login, setLogin] = React.useState({ email: "", password: "", approve: true });
  const [err, setErr] = React.useState<string | null>(null);
  const reset = () => { setF(blank); setLogin({ email: "", password: "", approve: true }); setErr(null); setShowPw(false); };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await createRiderAction({ ...f, email: login.email, password: login.password, approve: login.approve });
      if (!r.ok) { setErr(r.error); return; }
      toast.success("Rider added", login.approve ? `${f.fullName} can sign in and go online now.` : `${f.fullName} is waiting under Pending approval.`);
      setOpen(false); reset(); router.refresh();
    } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className={btn.primary} onClick={() => { reset(); setOpen(true); }}><UserPlus className="h-4 w-4" aria-hidden />Add rider</button>
      <Modal open={open} onClose={() => (busy ? undefined : setOpen(false))} title="Add a rider" description="Creates the rider's sign-in and their delivery partner record. They can change the password after signing in." size="md"
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button className="flex-1" loading={busy} onClick={save}>Add rider</Button></div>}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <RiderFields f={f} setF={setF} cities={cities} />
          <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
            <Input label="Sign-in email" required type="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} autoComplete="off" />
            <div className="relative">
              <Input label="Password" required type={showPw ? "text" : "password"} value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} autoComplete="new-password" hint="At least 8 characters. Share it privately." />
              <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} className="absolute right-2 top-[30px] flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2">{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </div>
          <Switch checked={login.approve} onChange={(v) => setLogin({ ...login, approve: v })} label={login.approve ? "Approved: can go online right away" : "Pending approval: approve later from this page"} description="Self sign-ups always start as pending; riders you add here are usually people you already know." />
          {err ? <p className="text-sm text-danger">{err}</p> : null}
        </form>
      </Modal>
    </>
  );
}

/** Row buttons: edit the rider's details, or delete (only riders with no delivery history). */
export function RiderRowActions({ rider: r, cities, selfId }: { rider: RiderRow; cities: CityRow[]; selfId: string }) {
  const router = useRouter();
  const name = r.user?.full_name ?? "this rider";
  const [edit, setEdit] = React.useState(false);
  const [del, setDel] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const initial = React.useMemo<Form>(() => ({ fullName: r.user?.full_name ?? "", phone: r.user?.phone ?? "", vehicle_type: r.vehicle_type, vehicle_number: r.vehicle_number ?? "", license_number: r.license_number ?? "", city_id: r.city_id ?? "", emergency_contact: r.emergency_contact ?? "" }), [r]);
  const [f, setF] = React.useState<Form>(initial);
  const isSelf = r.user_id === selfId;
  const hasHistory = r.total_deliveries > 0 || Number(r.total_earnings) > 0;

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await updateRiderAction(r.id, f);
      if (!res.ok) { setErr(res.error); return; }
      toast.success("Rider updated"); setEdit(false); router.refresh();
    } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const res = await deleteRiderAction(r.id);
      if (!res.ok) { toast.error("Not deleted", res.error); setDel(false); return; }
      toast.success("Rider deleted", res.data.accountDeleted ? "Their sign-in was removed too." : "Their sign-in stays as a customer account (it has orders)."); setDel(false); router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className={cn(btn.secondary, btn.small)} onClick={() => { setF(initial); setErr(null); setEdit(true); }}><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</button>
      <button type="button" className={cn(btn.dangerOutline, btn.small)} disabled={isSelf || hasHistory} title={isSelf ? "You cannot delete yourself" : hasHistory ? "Has delivery history: suspend instead" : undefined} onClick={() => setDel(true)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete</button>

      <Modal open={edit} onClose={() => (busy ? undefined : setEdit(false))} title={r.user?.full_name ?? "Edit rider"} description={r.user?.email ?? undefined} size="md"
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={busy} onClick={() => setEdit(false)}>Cancel</Button><Button className="flex-1" loading={busy} onClick={save}>Save</Button></div>}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <RiderFields f={f} setF={setF} cities={cities} />
          <p className="text-xs text-ink-3">Approve, suspend or reinstate from the View panel; those changes notify the rider.</p>
          {err ? <p className="text-sm text-danger">{err}</p> : null}
        </form>
      </Modal>
      <ConfirmDialog open={del} onClose={() => (busy ? undefined : setDel(false))} onConfirm={remove} tone="danger" title={`Delete ${name}?`} description="Removes the rider record permanently. Their sign-in is removed too unless it has customer orders, in which case it stays as a customer account. Riders with deliveries or earnings on record cannot be deleted; suspend those instead." confirmLabel="Delete rider" loading={busy} />
    </span>
  );
}
