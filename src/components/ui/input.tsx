import * as React from "react";
import { cn } from "@/lib/utils";

const fieldBase = "w-full rounded-sm border border-line-2 bg-card px-3.5 text-[15px] text-ink placeholder:text-ink-4 transition-shadow focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-surface-2 disabled:text-ink-3 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger-50";

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
          {label}
          {props.required ? <span className="text-danger"> *</span> : null}
        </label>
      ) : null}
      <div className="relative">
        {leftIcon ? <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-3">{leftIcon}</span> : null}
        <input ref={ref} id={inputId} aria-invalid={Boolean(error)} className={cn(fieldBase, "h-11", leftIcon && "pl-10", rightSlot && "pr-12", className)} {...props} />
        {rightSlot ? <span className="absolute inset-y-0 right-2 flex items-center">{rightSlot}</span> : null}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; hint?: string; error?: string }
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, label, hint, error, id, ...props }, ref) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  return (
    <div className="space-y-1.5">
      {label ? <label htmlFor={inputId} className="block text-sm font-medium text-ink-2">{label}</label> : null}
      <textarea ref={ref} id={inputId} aria-invalid={Boolean(error)} className={cn(fieldBase, "min-h-24 py-2.5", className)} {...props} />
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; hint?: string; error?: string; options: { value: string; label: string }[]; placeholder?: string }
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, label, hint, error, id, options, placeholder, ...props }, ref) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  return (
    <div className="space-y-1.5">
      {label ? <label htmlFor={inputId} className="block text-sm font-medium text-ink-2">{label}</label> : null}
      <select ref={ref} id={inputId} aria-invalid={Boolean(error)} className={cn(fieldBase, "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%237a837e%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", className)} {...props}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
});

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className={cn("inline-flex items-center gap-3 cursor-pointer select-none", disabled && "opacity-50 pointer-events-none")}>
      <span role="switch" aria-checked={checked} tabIndex={0} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); } }} onClick={() => onChange(!checked)}
        className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors", checked ? "bg-brand-600" : "bg-line-2")}>
        <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
      </span>
      {label ? <span className="text-sm font-medium text-ink">{label}</span> : null}
    </label>
  );
}

export function Checkbox({ label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label className={cn("inline-flex items-center gap-2.5 cursor-pointer text-sm text-ink", className)}>
      <input type="checkbox" className="h-4.5 w-4.5 rounded-xs border-line-2 text-brand-600 accent-brand-600 focus:ring-brand-400" {...props} />
      {label}
    </label>
  );
}
