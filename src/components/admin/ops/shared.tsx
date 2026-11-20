"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/* Small client helpers shared by the riders / delivery / users admin pages. */

type Result = { ok: boolean; error?: string };

/**
 * Runs a server action with a busy key, a success toast and a refresh. Errors are already
 * `friendlyError`-ed by the actions; they are shown as an error toast and returned to the caller.
 */
export function useRunAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = React.useCallback(async (key: string, fn: () => Promise<Result>, okMsg: string, okDetail?: string): Promise<Result> => {
    setBusy(key);
    try {
      const r = await fn();
      if (r.ok) { toast.success(okMsg, okDetail); router.refresh(); }
      else toast.error("Couldn't save", r.error ?? "Something went wrong. Try again.");
      return r;
    } catch {
      toast.error("Couldn't reach the server", "Check your connection and try again.");
      return { ok: false, error: "Network error" };
    } finally { setBusy(null); }
  }, [router]);
  return { busy, run };
}

/**
 * Confirmation dialog for consequential changes (status, role, deactivation…). Optional note field
 * (e.g. a reason sent to the rider). The confirm button states the exact action.
 */
export function ConfirmChange({ open, onClose, onConfirm, title, description, confirmLabel, tone = "primary", loading, note, warning, children }: {
  open: boolean; onClose: () => void; onConfirm: (note: string) => void; title: string; description?: React.ReactNode; confirmLabel: string;
  tone?: "primary" | "danger"; loading?: boolean; warning?: React.ReactNode; children?: React.ReactNode;
  note?: { label: string; placeholder?: string; required?: boolean; hint?: string };
}) {
  const [text, setText] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open) { setText(""); setTouched(false); } }
  const missing = Boolean(note?.required && text.trim().length < 3);
  const submit = () => { setTouched(true); if (missing) return; onConfirm(text.trim()); };
  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title={title} size="sm" footer={
      <div className="flex gap-2">
        <Button variant="outline" fullWidth onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} fullWidth loading={loading} onClick={submit}>{confirmLabel}</Button>
      </div>
    }>
      <div className="space-y-3">
        {description ? <div className="text-sm text-ink-2">{description}</div> : null}
        {warning ? (
          <div role="note" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-50 px-3 py-2 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><div>{warning}</div>
          </div>
        ) : null}
        {children}
        {note ? (
          <Textarea label={note.required ? `${note.label} (required)` : `${note.label} (optional)`} value={text} placeholder={note.placeholder}
            onChange={(e) => setText(e.target.value)} onBlur={() => setTouched(true)} maxLength={500}
            error={touched && missing ? "Add a short reason (at least 3 characters)." : undefined} hint={note.hint} />
        ) : null}
      </div>
    </Modal>
  );
}

/** Footer for SidePanel forms: unsaved state on the left, Cancel + Save on the right. */
export function PanelFormFooter({ dirty, saving, onCancel, submitLabel = "Save changes", formId, disabled }: { dirty: boolean; saving: boolean; onCancel: () => void; submitLabel?: string; formId: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="mr-auto text-xs text-ink-3" role="status">{saving ? "Saving…" : dirty ? <span className="font-medium text-warning">Unsaved changes</span> : "No changes yet"}</p>
      <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
      <Button type="submit" form={formId} size="sm" loading={saving} disabled={disabled || !dirty}>{saving ? "Saving…" : submitLabel}</Button>
    </div>
  );
}

/** A labelled group of fields inside a side panel form. */
export function FieldGroup({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("min-w-0 border-t border-line pt-4 first:border-t-0 first:pt-0", className)}>
      <legend className="float-left w-full text-sm font-semibold text-ink">{title}</legend>
      {description ? <p className="clear-both pt-0.5 text-xs text-ink-3">{description}</p> : null}
      <div className="clear-both space-y-3 pt-3">{children}</div>
    </fieldset>
  );
}

/** Summary of validation problems shown above a form after a failed submit. */
export function FormErrorSummary({ errors }: { errors: Record<string, string | undefined> }) {
  const list = Object.values(errors).filter(Boolean) as string[];
  if (!list.length) return null;
  return (
    <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger-50 px-3 py-2 text-sm text-[#b4231b]">
      <p className="font-semibold">Fix {list.length === 1 ? "this field" : `these ${list.length} fields`} to save:</p>
      <ul className="mt-1 list-disc pl-5 text-xs">{list.map((e, i) => <li key={i}>{e}</li>)}</ul>
    </div>
  );
}
