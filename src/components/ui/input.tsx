import * as React from "react";
import { cn, isOptionGroup, type GroupedOptions } from "@/lib/utils";

/* text-base below sm on purpose: iOS Safari zooms the page when a focused field is under 16px,
   which leaves the layout shifted and clipped until the customer pinches back out. */
const fieldBase = "w-full rounded-sm border border-line-2 bg-card px-3.5 text-base sm:text-[15px] text-ink placeholder:text-ink-4 transition-shadow focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-surface-2 disabled:text-ink-3 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger-50";

/** Hint or error under a field, linked to it with aria-describedby; errors carry an icon, not just red text. */
function FieldNote({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) return <p id={`${id}-note`} className="flex items-start gap-1 text-xs font-medium text-danger"><svg aria-hidden viewBox="0 0 24 24" className="mt-px h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.25"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>{error}</p>;
  if (hint) return <p id={`${id}-note`} className="text-xs text-ink-3">{hint}</p>;
  return null;
}
const describedBy = (id: string, error?: string, hint?: string, own?: string) => [own, error || hint ? `${id}-note` : null].filter(Boolean).join(" ") || undefined;
const Req = ({ on }: { on?: boolean }) => (on ? <span className="text-danger" aria-hidden> *</span> : null);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, leftIcon, rightSlot, id, wrapperClassName, ...props },
  ref,
) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  return (
    <div className={cn("space-y-1.5", wrapperClassName)}>
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-2">
          {label}<Req on={props.required} />
        </label>
      ) : null}
      <div className="relative">
        {leftIcon ? <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-3">{leftIcon}</span> : null}
        <input ref={ref} id={inputId} aria-invalid={Boolean(error)} aria-describedby={describedBy(inputId, error, hint, props["aria-describedby"])} className={cn(fieldBase, "h-11", leftIcon && "pl-10", rightSlot && "pr-12", className)} {...props} />
        {rightSlot ? <span className="absolute inset-y-0 right-2 flex items-center">{rightSlot}</span> : null}
      </div>
      <FieldNote id={inputId} error={error} hint={hint} />
    </div>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; hint?: string; error?: string }
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, label, hint, error, id, ...props }, ref) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  return (
    <div className="space-y-1.5">
      {label ? <label htmlFor={inputId} className="block text-sm font-medium text-ink-2">{label}<Req on={props.required} /></label> : null}
      <textarea ref={ref} id={inputId} aria-invalid={Boolean(error)} aria-describedby={describedBy(inputId, error, hint, props["aria-describedby"])} className={cn(fieldBase, "min-h-24 py-2.5", className)} {...props} />
      <FieldNote id={inputId} error={error} hint={hint} />
    </div>
  );
});

/** Options may be grouped: an entry carrying its own `options` renders as an <optgroup>. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; hint?: string; error?: string; options: GroupedOptions; placeholder?: string }
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, label, hint, error, id, options, placeholder, ...props }, ref) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  return (
    <div className="space-y-1.5">
      {label ? <label htmlFor={inputId} className="block text-sm font-medium text-ink-2">{label}<Req on={props.required} /></label> : null}
      <select ref={ref} id={inputId} aria-invalid={Boolean(error)} aria-describedby={describedBy(inputId, error, hint, props["aria-describedby"])} className={cn(fieldBase, "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%237a837e%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", className)} {...props}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => isOptionGroup(o)
          ? <optgroup key={o.label} label={o.label}>{o.options.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</optgroup>
          : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <FieldNote id={inputId} error={error} hint={hint} />
    </div>
  );
});

/**
 * On/off switch. A real <button role="switch"> named by its visible label (or `ariaLabel` when there is
 * none), with a visible focus ring and a ≥44px touch area around the 28px track.
 */
export function Switch({ checked, onChange, label, disabled, ariaLabel, description, className }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean; ariaLabel?: string; description?: React.ReactNode; className?: string }) {
  const id = React.useId();
  return (
    <span className={cn("inline-flex min-h-11 items-center gap-3 select-none", disabled && "opacity-60", className)}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        aria-labelledby={label ? `${id}-l` : undefined} aria-label={label ? undefined : ariaLabel} aria-describedby={description ? `${id}-d` : undefined}
        className={cn("relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors before:absolute before:-inset-2 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed", checked ? "bg-brand-600" : "bg-ink-4")}>
        <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
      </button>
      {label || description ? (
        <span className="min-w-0">
          {label ? <span id={`${id}-l`} className="block cursor-pointer text-sm font-medium text-ink" onClick={() => { if (!disabled) onChange(!checked); }}>{label}</span> : null}
          {description ? <span id={`${id}-d`} className="block text-xs text-ink-3">{description}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

export function Checkbox({ label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label className={cn("inline-flex items-center gap-2.5 cursor-pointer text-sm text-ink", className)}>
      <input type="checkbox" className="h-4.5 w-4.5 rounded-xs border-line-2 text-brand-600 accent-brand-600 focus-visible:ring-2 focus-visible:ring-brand-600" {...props} />
      {label}
    </label>
  );
}
