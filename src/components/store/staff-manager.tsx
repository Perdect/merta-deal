"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Trash2, Crown } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button, IconButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { addStaffAction, removeStaffAction } from "@/lib/actions/store";
import type { StaffMember } from "@/lib/data/store";
import type { Enums } from "@/types/database";

/** Owner adds staff by the email of an existing Merta Deal account (rpc store_add_staff) and removes them. */
export function StaffManager({ storeId, staff, isOwner, owner }: { storeId: string; staff: StaffMember[]; isOwner: boolean; owner: { name: string | null; email: string | null } }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Enums<"store_staff_role">>("staff");
  const [busy, setBusy] = React.useState(false);
  const [removing, setRemoving] = React.useState<StaffMember | null>(null);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const r = await addStaffAction(storeId, email, role);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Staff added", `${email} can now sign in to the store portal.`); setEmail(""); router.refresh();
  };
  const remove = async () => {
    if (!removing) return; setBusy(true);
    const r = await removeStaffAction(removing.id);
    setBusy(false); setRemoving(null);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Staff removed"); router.refresh();
  };
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line rounded-lg border border-line bg-card">
        <li className="flex items-center gap-3 px-3 py-2.5"><Avatar name={owner.name} size={36} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{owner.name ?? "Owner"}</p><p className="truncate text-xs text-ink-3">{owner.email}</p></div><Badge tone="saffron" size="xs"><Crown className="h-3 w-3" /> Owner</Badge></li>
        {staff.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
            <Avatar name={s.full_name} src={s.avatar_url} size={36} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{s.full_name ?? s.email ?? "Staff"}</p><p className="truncate text-xs text-ink-3">{s.email}{s.phone ? ` · ${s.phone}` : ""}</p></div>
            <Badge tone={s.role === "manager" ? "brand" : "neutral"} size="xs" className="capitalize">{s.role}</Badge>
            {isOwner ? <IconButton label="Remove staff" className="h-9 w-9 text-danger" onClick={() => setRemoving(s)}><Trash2 className="h-4 w-4" /></IconButton> : null}
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end">
          <Input label="Add staff by email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com" hint="They must already have a Merta Deal account" />
          <Select label="Role" options={[{ value: "staff", label: "Staff" }, { value: "manager", label: "Manager" }]} value={role} onChange={(e) => setRole(e.target.value as Enums<"store_staff_role">)} />
          <Button type="submit" loading={busy} disabled={!email.trim()} className="sm:mb-5"><UserPlus className="h-4 w-4" /> Add</Button>
        </form>
      ) : <p className="text-xs text-ink-3">Only the store owner can add or remove staff.</p>}
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} loading={busy} tone="danger" title={`Remove ${removing?.full_name ?? removing?.email ?? "this member"}?`} description="They lose access to the store portal immediately." confirmLabel="Remove" />
    </div>
  );
}
