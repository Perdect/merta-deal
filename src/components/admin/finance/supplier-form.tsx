"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/overlay";
import { Input, Textarea, Switch } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { btn } from "@/components/admin/care/shared";
import { saveSupplierAction, type SupplierInput } from "@/lib/actions/finance";
import { cn } from "@/lib/utils";

export type SupplierRow = { id: string; name: string; phone: string | null; email: string | null; gstin: string | null; address: string | null; notes: string | null; is_active: boolean };

/** Add or edit a supplier in a dialog. */
export function SupplierForm({ supplier }: { supplier?: SupplierRow }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [f, setF] = React.useState<SupplierInput>({ name: supplier?.name ?? "", phone: supplier?.phone ?? "", email: supplier?.email ?? "", gstin: supplier?.gstin ?? "", address: supplier?.address ?? "", notes: supplier?.notes ?? "", is_active: supplier?.is_active ?? true });
  const save = async () => {
    setBusy(true);
    try {
      const r = await saveSupplierAction(supplier?.id ?? null, f);
      if (!r.ok) { toast.error("Not saved", r.error); return; }
      toast.success(supplier ? "Supplier updated" : "Supplier added"); setOpen(false); router.refresh();
    } finally { setBusy(false); }
  };
  return (
    <>
      {supplier
        ? <button type="button" className={cn(btn.secondary, btn.small)} onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</button>
        : <button type="button" className={btn.primary} onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Add supplier</button>}
      <Modal open={open} onClose={() => (busy ? undefined : setOpen(false))} title={supplier ? supplier.name : "New supplier"} size="sm"
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button className="flex-1" loading={busy} onClick={save}>Save</Button></div>}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Input label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" inputMode="tel" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <Input label="GSTIN" value={f.gstin ?? ""} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} />
          </div>
          <Input label="Email" type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Textarea label="Address" value={f.address ?? ""} onChange={(e) => setF({ ...f, address: e.target.value })} />
          <Textarea label="Notes" value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Credit terms, delivery days…" />
          {supplier ? <Switch checked={Boolean(f.is_active)} onChange={(v) => setF({ ...f, is_active: v })} label={f.is_active ? "Active" : "Inactive"} description="Inactive suppliers stay on old documents but are hidden from new ones." /> : null}
        </form>
      </Modal>
    </>
  );
}
