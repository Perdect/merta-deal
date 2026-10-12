"use client";
import * as React from "react";
import { SidePanel, useUnsavedChanges } from "@/components/admin/kit";
import { btn } from "./shared";
import { cn } from "@/lib/utils";

/**
 * Create / edit form in the kit SidePanel: labelled body, visible Cancel + Save, saving state,
 * a server-error line, and a discard warning when closing with unsaved edits.
 */
export function FormPanel({ open, title, description, dirty, saving, onClose, onSubmit, submitLabel = "Save changes", error, children, width = "md" }: {
  open: boolean; title: string; description?: React.ReactNode; dirty: boolean; saving: boolean; onClose: () => void; onSubmit: () => void;
  submitLabel?: string; error?: string | null; children: React.ReactNode; width?: "sm" | "md" | "lg";
}) {
  const formId = React.useId();
  const confirmDiscard = useUnsavedChanges(open && dirty);
  // SidePanel re-runs its focus effect whenever onClose changes, so keep `close` stable and read
  // the latest state through a ref; otherwise the first keystroke (dirty flips) would steal focus.
  const latest = React.useRef({ confirmDiscard, onClose, saving });
  React.useLayoutEffect(() => { latest.current = { confirmDiscard, onClose, saving }; });
  const close = React.useCallback(() => { const l = latest.current; if (l.saving) return; if (l.confirmDiscard()) l.onClose(); }, []);
  return (
    <SidePanel open={open} onClose={close} title={title} description={description} width={width}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-xs text-ink-3" role="status">{saving ? "Saving…" : dirty ? <span className="font-medium text-[#8a6300]">Unsaved changes</span> : null}</p>
          <button type="button" onClick={close} disabled={saving} className={btn.secondary}>Cancel</button>
          <button type="submit" form={formId} disabled={saving} className={btn.primary}>
            {saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden /> : null}
            {saving ? "Saving…" : submitLabel}
          </button>
        </div>
      }>
      <form id={formId} noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
        {error ? <p role="alert" className="rounded-lg border border-danger/25 bg-danger-50 px-3 py-2 text-sm text-[#8a1f18]">{error}</p> : null}
        {children}
      </form>
    </SidePanel>
  );
}

/** Group of fields inside a FormPanel. */
export function FieldGroup({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("space-y-3", className)}>
      {title ? <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</legend> : null}
      {children}
    </fieldset>
  );
}

/** ISO instant → value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
/** datetime-local value (browser zone) → ISO instant, so the server never re-interprets the zone. */
export function fromLocalInput(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** First error per field: returns null when valid. */
export type Errors<K extends string> = Partial<Record<K, string>>;
export const hasErrors = (e: Record<string, string | undefined>) => Object.values(e).some(Boolean);
