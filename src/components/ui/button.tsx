import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "saffron" | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

const base = "tap inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap select-none transition-[background-color,box-shadow,transform,opacity] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:pointer-events-none rounded-sm";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-[0_1px_0_rgb(0_0_0/0.05)]",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  outline: "border border-line-2 bg-card text-ink hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-white hover:bg-[#c02c24]",
  saffron: "bg-saffron-500 text-ink hover:bg-saffron-600",
  link: "text-brand-600 underline-offset-4 hover:underline p-0 h-auto rounded-none",
};
const sizes: Record<ButtonSize, string> = {
  xs: "h-8 px-3 text-xs rounded-xs",
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base rounded-md",
  icon: "h-10 w-10 p-0",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  href?: string;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, href, fullWidth, children, disabled, type, ...props },
  ref,
) {
  // Disabled = readable grey (≥4.5:1), not a faded brand colour; loading keeps the portal colour + spinner.
  const state = loading
    ? "pointer-events-none cursor-progress opacity-90"
    : disabled
      ? variant === "link" || variant === "ghost" ? "text-ink-3" : "bg-surface-2 text-ink-3 border border-line shadow-none hover:bg-surface-2"
      : null;
  const cls = cn(base, variants[variant], sizes[size], fullWidth && "w-full", className, state);
  if (href) {
    return (
      <Link href={href} className={cls} aria-disabled={disabled || loading} aria-busy={loading || undefined}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {children}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type ?? "button"} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

export function IconButton({ className, label, ...props }: ButtonProps & { label: string }) {
  return <Button variant="ghost" size="icon" aria-label={label} title={label} className={cn("rounded-full", className)} {...props} />;
}
