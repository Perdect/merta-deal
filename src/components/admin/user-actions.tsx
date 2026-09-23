"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Wallet, ShieldCheck, UserX, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Input, Textarea } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ROLE_OPTIONS } from "@/components/admin/constants";
import { setUserRoleAction, setUserActiveAction, creditWalletAction } from "@/lib/actions/admin";
import type { Enums } from "@/types/database";

export function UserActions({ userId, role, isActive, isSuperAdmin, name }: { userId: string; role: Enums<"user_role">; isActive: boolean; isSuperAdmin: boolean; name: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [nextRole, setNextRole] = React.useState<Enums<"user_role">>(role);
  const [confirmRole, setConfirmRole] = React.useState(false);
  const [confirmActive, setConfirmActive] = React.useState(false);
  const [walletOpen, setWalletOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (r.ok) { toast.success(okMsg); router.refresh(); return true; }
    toast.error(r.error ?? "Something went wrong"); return false;
  };

  const roleOptions = ROLE_OPTIONS.filter((o) => isSuperAdmin || (o.value !== "admin" && o.value !== "super_admin"));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-card p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-brand-600" /> Role</p>
        <div className="flex gap-2">
          <div className="flex-1"><Select aria-label="Role" options={roleOptions} value={nextRole} onChange={(e) => setNextRole(e.target.value as Enums<"user_role">)} /></div>
          <Button variant="outline" disabled={nextRole === role} onClick={() => setConfirmRole(true)}>Change</Button>
        </div>
        {!isSuperAdmin ? <p className="mt-1.5 text-xs text-ink-3">Only a super admin can grant admin roles.</p> : null}
        {nextRole === "rider" && role !== "rider" ? <p className="mt-1.5 text-xs text-ink-3">A pending delivery partner record will be created; approve it under Riders.</p> : null}
      </div>

      <div className="rounded-lg border border-line bg-card p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><Wallet className="h-4 w-4 text-brand-600" /> Wallet credit</p>
        <p className="text-xs text-ink-3">Goodwill credit or manual refund. Creates a ledger entry, notifies the user and is audited.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setWalletOpen(true)}>Credit wallet</Button>
      </div>

      <div className="rounded-lg border border-line bg-card p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">{isActive ? <UserX className="h-4 w-4 text-danger" /> : <UserCheck className="h-4 w-4 text-success" />} Account access</p>
        <p className="text-xs text-ink-3">{isActive ? "Deactivating blocks broadcasts and flags the account; existing orders are untouched." : "This account is deactivated."}</p>
        <Button variant={isActive ? "danger" : "primary"} size="sm" className="mt-3" onClick={() => setConfirmActive(true)}>{isActive ? "Deactivate account" : "Reactivate account"}</Button>
      </div>

      <ConfirmDialog open={confirmRole} onClose={() => setConfirmRole(false)} title={`Change role to ${nextRole.replace("_", " ")}?`} description={`${name ?? "This user"} will immediately gain the permissions of that role and be redirected to its portal on next load.`} confirmLabel="Change role" loading={busy === "role"}
        onConfirm={() => run("role", () => setUserRoleAction(userId, nextRole), "Role updated").then((ok) => ok && setConfirmRole(false))} />
      <ConfirmDialog open={confirmActive} onClose={() => setConfirmActive(false)} tone={isActive ? "danger" : "primary"} title={isActive ? "Deactivate this account?" : "Reactivate this account?"} confirmLabel={isActive ? "Deactivate" : "Reactivate"} loading={busy === "active"}
        onConfirm={() => run("active", () => setUserActiveAction(userId, !isActive), isActive ? "Account deactivated" : "Account reactivated").then((ok) => ok && setConfirmActive(false))} />

      <Modal open={walletOpen} onClose={() => setWalletOpen(false)} title="Credit wallet" description={name ?? undefined} size="sm" footer={
        <div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setWalletOpen(false)}>Cancel</Button><Button fullWidth loading={busy === "wallet"} onClick={() => run("wallet", () => creditWalletAction(userId, Number(amount), reason), `₹${amount} credited`).then((ok) => { if (ok) { setWalletOpen(false); setAmount(""); setReason(""); } })}>Credit</Button></div>
      }>
        <div className="space-y-3">
          <Input label="Amount (₹)" type="number" inputMode="decimal" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <Textarea label="Reason (shown to the user)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Refund for damaged item in order MD2609001234" required />
        </div>
      </Modal>
    </div>
  );
}
