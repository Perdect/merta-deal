"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { Input, Select, Switch } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { btn } from "@/components/admin/care/shared";
import { createUserAction, updateUserAction, deleteUserAction } from "@/lib/actions/admin-users";
import type { Enums } from "@/types/database";
import { cn } from "@/lib/utils";

type Role = Enums<"user_role">;
const ROLE_HELP: Record<Role, string> = {
  customer: "Shops on the site. No access to staff screens.",
  rider: "Delivery partner app: goes online, takes offers, delivers with OTP.",
  admin: "Whole admin panel: orders, stock, riders, settings. Cannot manage admin accounts.",
  super_admin: "Everything, including creating and changing admin accounts.",
};
// Admin roles are offered only to a super admin (the server enforces the same rule).
const roleOptions = (isSuper: boolean) => (["customer", "rider", "admin", "super_admin"] as Role[]).filter((r) => isSuper || (r !== "admin" && r !== "super_admin")).map((r) => ({ value: r, label: r === "super_admin" ? "Super admin" : r[0].toUpperCase() + r.slice(1) }));

export type ManagedUser = { id: string; full_name: string | null; phone: string | null; email: string | null; role: Role; is_active: boolean; is_guest: boolean };

/** Header button: create a sign-in (email + password) with a role. */
export function AddUserButton({ isSuper }: { isSuper: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [showPw, setShowPw] = React.useState(false);
  const [f, setF] = React.useState({ email: "", password: "", fullName: "", phone: "", role: "customer" as Role });
  const [err, setErr] = React.useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await createUserAction({ email: f.email, password: f.password, fullName: f.fullName, phone: f.phone, role: f.role });
      if (!r.ok) { setErr(r.error); return; }
      toast.success("Account created", `${f.fullName} can sign in now${f.role === "customer" ? "" : ` as ${f.role.replace("_", " ")}`}.`);
      setOpen(false); setF({ email: "", password: "", fullName: "", phone: "", role: "customer" }); router.refresh();
    } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className={btn.primary} onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" aria-hidden />Add user</button>
      <Modal open={open} onClose={() => (busy ? undefined : setOpen(false))} title="Add a user" description="Creates a sign-in with email and password. The person can change the password after signing in." size="sm"
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button className="flex-1" loading={busy} onClick={save}>Create account</Button></div>}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Input label="Full name" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoComplete="off" />
          <Input label="Email" required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="off" />
          <div className="relative">
            <Input label="Password" required type={showPw ? "text" : "password"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" hint="At least 8 characters. Share it with the person privately." />
            <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} className="absolute right-2 top-[30px] flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2">{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <Input label="Mobile (optional)" inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })} />
          <Select label="Role" options={roleOptions(isSuper)} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} hint={ROLE_HELP[f.role]} />
          {!isSuper ? <p className="text-xs text-ink-3">Admin roles can only be given by a super admin.</p> : null}
          {err ? <p className="text-sm text-danger">{err}</p> : null}
        </form>
      </Modal>
    </>
  );
}

/** Row buttons: edit name / phone / role / active, or delete (only for accounts with no orders). */
export function UserRowActions({ user: u, isSuper, selfId }: { user: ManagedUser; isSuper: boolean; selfId: string }) {
  const router = useRouter();
  const [edit, setEdit] = React.useState(false);
  const [del, setDel] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [f, setF] = React.useState({ fullName: u.full_name ?? "", phone: u.phone ?? "", role: u.role, isActive: u.is_active });
  const [err, setErr] = React.useState<string | null>(null);
  const isSelf = u.id === selfId;
  const adminTarget = u.role === "admin" || u.role === "super_admin";
  const locked = adminTarget && !isSuper;

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await updateUserAction(u.id, f);
      if (!r.ok) { setErr(r.error); return; }
      toast.success("User updated"); setEdit(false); router.refresh();
    } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const r = await deleteUserAction(u.id);
      if (!r.ok) { toast.error("Not deleted", r.error); setDel(false); return; }
      toast.success("Account deleted"); setDel(false); router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className={cn(btn.secondary, btn.small)} disabled={locked} title={locked ? "Only a super admin can change an admin" : undefined} onClick={() => { setF({ fullName: u.full_name ?? "", phone: u.phone ?? "", role: u.role, isActive: u.is_active }); setErr(null); setEdit(true); }}><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</button>
      <button type="button" className={cn(btn.dangerOutline, btn.small)} disabled={isSelf || locked} title={isSelf ? "You cannot delete yourself" : locked ? "Only a super admin can delete an admin" : undefined} onClick={() => setDel(true)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete</button>

      <Modal open={edit} onClose={() => (busy ? undefined : setEdit(false))} title={u.full_name ?? "Edit user"} description={u.email ?? u.phone ?? (u.is_guest ? "Guest checkout account" : undefined)} size="sm"
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={busy} onClick={() => setEdit(false)}>Cancel</Button><Button className="flex-1" loading={busy} onClick={save}>Save</Button></div>}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Input label="Full name" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          <Input label="Mobile" inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })} />
          <Select label="Role" options={roleOptions(isSuper)} value={f.role} disabled={isSelf} onChange={(e) => setF({ ...f, role: e.target.value as Role })} hint={isSelf ? "You cannot change your own role." : ROLE_HELP[f.role]} />
          <Switch checked={f.isActive} disabled={isSelf} onChange={(v) => setF({ ...f, isActive: v })} label={f.isActive ? "Active" : "Deactivated"} description={isSelf ? "You cannot deactivate yourself." : "A deactivated account cannot sign in; its orders and history stay."} />
          {err ? <p className="text-sm text-danger">{err}</p> : null}
        </form>
      </Modal>
      <ConfirmDialog open={del} onClose={() => (busy ? undefined : setDel(false))} onConfirm={remove} tone="danger" title={`Delete ${u.full_name ?? "this account"}?`} description="This removes the sign-in and profile permanently. Accounts with orders cannot be deleted; deactivate those instead." confirmLabel="Delete account" loading={busy} />
    </span>
  );
}
