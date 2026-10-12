"use client";
import * as React from "react";
import { ShieldCheck, UserCheck, UserX, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SidePanel, rupees, useUnsavedChanges } from "@/components/admin/kit";
import { ConfirmChange, FieldGroup, PanelFormFooter, useRunAction } from "@/components/admin/ops/shared";
import { RolePill, ROLE_LABEL } from "@/components/admin/ops/pills";
import { ROLE_OPTIONS } from "@/components/admin/constants";
import { setUserRoleAction, setUserActiveAction, creditWalletAction } from "@/lib/actions/admin";
import type { Enums } from "@/types/database";

type Role = Enums<"user_role">;
const ADMIN_ROLES: Role[] = ["admin", "super_admin"];
const MAX_CREDIT = 100000; // mirrors creditWalletAction's validation

function roleConsequence(from: Role, to: Role) {
  const parts: string[] = [];
  if (to === "rider") parts.push("A pending delivery partner record is created; approve it under Riders before they can deliver.");
  if (to === "store_owner") parts.push("They get the store portal. A store still has to be registered and approved before it can sell.");
  if (to === "store_staff") parts.push("They only get store access once a store owner adds them as staff.");
  if (ADMIN_ROLES.includes(to)) parts.push(to === "super_admin" ? "They get full admin access, including granting admin roles." : "They get full access to this admin panel.");
  if (ADMIN_ROLES.includes(from) && !ADMIN_ROLES.includes(to)) parts.push("They lose admin access immediately.");
  if (to === "customer") parts.push("They keep their orders, wallet and addresses as a customer.");
  return parts.join(" ");
}

/** Role, wallet credit and account access controls for a user. Every change is confirmed. */
export function UserActions({ userId, role, isActive, isSuperAdmin, isSelf, name, walletBalance }: {
  userId: string; role: Role; isActive: boolean; isSuperAdmin: boolean; isSelf: boolean; name: string | null; walletBalance: number;
}) {
  const { busy, run } = useRunAction();
  const who = name ?? "This user";
  const [nextRole, setNextRole] = React.useState<Role>(role);
  const [prevRole, setPrevRole] = React.useState(role);
  if (role !== prevRole) { setPrevRole(role); setNextRole(role); }
  const [confirmRole, setConfirmRole] = React.useState(false);
  const [confirmActive, setConfirmActive] = React.useState(false);

  // Wallet credit: form in a side panel, then an explicit review/confirm step.
  const [walletOpen, setWalletOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [reviewing, setReviewing] = React.useState(false);
  const walletDirty = walletOpen && (amount !== "" || reason !== "");
  const confirmDiscard = useUnsavedChanges(walletDirty);
  const amt = Number(amount);
  const amountError = amount.trim() === "" ? "Enter an amount." : !Number.isFinite(amt) || amt <= 0 ? "Amount must be more than ₹0." : amt > MAX_CREDIT ? `The most you can credit at once is ${rupees(MAX_CREDIT)}.` : !/^\d+(\.\d{1,2})?$/.test(amount.trim()) ? "Use at most 2 decimal places." : undefined;
  const reasonError = reason.trim().length < 3 ? "Add a short reason (at least 3 characters); the user sees it." : undefined;
  const closeWallet = () => { if (!confirmDiscard()) return; setWalletOpen(false); setAmount(""); setReason(""); setSubmitted(false); };

  const targetIsAdmin = ADMIN_ROLES.includes(role);
  const canChangeRole = !isSelf && (isSuperAdmin || !targetIsAdmin);
  const roleOptions = ROLE_OPTIONS.filter((o) => isSuperAdmin || !ADMIN_ROLES.includes(o.value as Role));
  const canToggleActive = !isSelf && (isSuperAdmin || !targetIsAdmin);

  return (
    <div className="divide-y divide-line">
      <section className="pb-4" aria-labelledby="role-h">
        <h3 id="role-h" className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden />Role</h3>
        <p className="mb-3 flex items-center gap-2 text-sm text-ink-3">Current: <RolePill role={role} /></p>
        {canChangeRole ? (
          <>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1"><Select aria-label="New role" options={roleOptions} value={nextRole} onChange={(e) => setNextRole(e.target.value as Role)} /></div>
              <Button variant="outline" disabled={nextRole === role} onClick={() => setConfirmRole(true)}>Change</Button>
            </div>
            {!isSuperAdmin ? <p className="mt-1.5 text-xs text-ink-3">Only a super admin can grant admin roles.</p> : null}
          </>
        ) : (
          <p className="text-xs text-ink-3">{isSelf ? "You can't change your own role. Ask another super admin." : "Only a super admin can change an admin's role."}</p>
        )}
      </section>

      <section className="py-4" aria-labelledby="wallet-h">
        <h3 id="wallet-h" className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink"><Wallet className="h-4 w-4 text-brand-600" aria-hidden />Wallet credit</h3>
        <p className="text-xs text-ink-3">Balance {rupees(walletBalance)}. A goodwill credit or manual refund adds a ledger entry, notifies the user and is audited. No money leaves the platform.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setWalletOpen(true)}>Credit wallet</Button>
      </section>

      <section className="pt-4" aria-labelledby="access-h">
        <h3 id="access-h" className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">{isActive ? <UserX className="h-4 w-4 text-danger" aria-hidden /> : <UserCheck className="h-4 w-4 text-success" aria-hidden />}Account access</h3>
        <p className="text-xs text-ink-3">{isActive ? "Deactivating flags the account and stops broadcasts to it. Existing orders are untouched." : "This account is deactivated."}</p>
        {canToggleActive ? (
          <Button variant={isActive ? "outline" : "primary"} size="sm" className={isActive ? "mt-3 text-danger hover:bg-danger-50" : "mt-3"} onClick={() => setConfirmActive(true)}>{isActive ? "Deactivate account" : "Reactivate account"}</Button>
        ) : <p className="mt-2 text-xs text-ink-3">{isSelf ? "You can't deactivate your own account." : "Only a super admin can deactivate an admin."}</p>}
      </section>

      <ConfirmChange open={confirmRole} onClose={() => setConfirmRole(false)} title={`Change role to ${ROLE_LABEL[nextRole]}?`} confirmLabel="Change role" loading={busy === "role"}
        tone={ADMIN_ROLES.includes(nextRole) || ADMIN_ROLES.includes(role) ? "danger" : "primary"}
        description={<>{who} changes from <strong>{ROLE_LABEL[role]}</strong> to <strong>{ROLE_LABEL[nextRole]}</strong> straight away and is sent to that role&apos;s portal on their next page load. {roleConsequence(role, nextRole)}</>}
        onConfirm={async () => { const r = await run("role", () => setUserRoleAction(userId, nextRole), "Role updated", `${who} is now ${ROLE_LABEL[nextRole]}.`); if (r.ok) setConfirmRole(false); }} />

      <ConfirmChange open={confirmActive} onClose={() => setConfirmActive(false)} tone={isActive ? "danger" : "primary"} loading={busy === "active"}
        title={isActive ? `Deactivate ${who}?` : `Reactivate ${who}?`} confirmLabel={isActive ? "Deactivate account" : "Reactivate account"}
        description={isActive ? "The account is flagged as deactivated and stops receiving broadcasts. Existing orders, wallet balance and history are kept. You can reactivate it later." : "The account is active again and receives broadcasts."}
        onConfirm={async () => { const r = await run("active", () => setUserActiveAction(userId, !isActive), isActive ? "Account deactivated" : "Account reactivated"); if (r.ok) setConfirmActive(false); }} />

      <SidePanel open={walletOpen} onClose={closeWallet} title="Credit wallet" description={who} width="sm"
        footer={<PanelFormFooter formId="wallet-credit" dirty={walletDirty} saving={busy === "wallet"} onCancel={closeWallet} submitLabel="Review credit" />}>
        <form id="wallet-credit" noValidate onSubmit={(e) => { e.preventDefault(); setSubmitted(true); if (!amountError && !reasonError) setReviewing(true); }} className="space-y-4">
          <FieldGroup title="Credit" description={`Current balance ${rupees(walletBalance)}.`}>
            <Input label="Amount (₹)" type="number" inputMode="decimal" min={1} max={MAX_CREDIT} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required error={submitted ? amountError : undefined} hint={`Up to ${rupees(MAX_CREDIT)} per credit.`} />
            <Textarea label="Reason (shown to the user)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Refund for a damaged item in order MD2609001234" error={submitted ? reasonError : undefined} />
          </FieldGroup>
        </form>
      </SidePanel>

      <ConfirmChange open={reviewing} onClose={() => setReviewing(false)} title={`Credit ${amountError ? "" : rupees(amt)} to ${who}?`} confirmLabel="Credit wallet" loading={busy === "wallet"}
        description={<>The new balance will be <strong>{rupees(walletBalance + (Number.isFinite(amt) ? amt : 0))}</strong>. The user is notified with your reason: “{reason.trim()}”. This can&apos;t be undone from here.</>}
        onConfirm={async () => {
          const r = await run("wallet", () => creditWalletAction(userId, amt, reason.trim()), `${rupees(amt)} credited`, `${who}'s wallet has been updated.`);
          if (r.ok) { setReviewing(false); setWalletOpen(false); setAmount(""); setReason(""); setSubmitted(false); }
        }} />
    </div>
  );
}
