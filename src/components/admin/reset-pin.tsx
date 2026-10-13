"use client";
import * as React from "react";
import { KeyRound, Copy } from "lucide-react";
import { resetUserPinAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

/** "Reset PIN" for an account (admin-assisted recovery). Shows the new PIN once; it is not stored anywhere readable. */
export function ResetPinButton({ userId, name, disabled, disabledReason }: { userId: string; name: string; disabled?: boolean; disabledReason?: string }) {
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [pin, setPin] = React.useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    const r = await resetUserPinAction(userId);
    setBusy(false); setConfirm(false);
    if (!r.ok) { toast.error(r.error); return; }
    setPin(r.data.pin);
  };
  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => setConfirm(true)} disabled={disabled} title={disabled ? disabledReason : undefined}><KeyRound className="h-4 w-4" aria-hidden /> Reset PIN</Button>
      {disabled && disabledReason ? <p className="mt-1 text-xs text-ink-3">{disabledReason}</p> : null}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={run} loading={busy} tone="danger" title={`Reset ${name}'s PIN?`}
        description="Their current PIN stops working immediately. Only do this after confirming who you are speaking to (for example, a call from their registered number)." confirmLabel="Reset PIN" />
      <Modal open={pin !== null} onClose={() => setPin(null)} title="New PIN">
        <div className="space-y-4">
          <p className="text-sm text-ink-2">Give this PIN to {name} in person or by phone. It is shown only once.</p>
          <p className="rounded-md border border-line bg-surface px-4 py-3 text-center font-mono text-3xl font-bold tracking-[0.3em] text-ink" aria-live="polite">{pin}</p>
          <Alert tone="info">Ask them to change it from their account settings after signing in.</Alert>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={async () => { try { await navigator.clipboard.writeText(pin ?? ""); toast.success("PIN copied"); } catch { toast.error("Copy failed — read it out instead."); } }}><Copy className="h-4 w-4" aria-hidden /> Copy</Button>
            <Button className="flex-1" onClick={() => setPin(null)}>Done</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
