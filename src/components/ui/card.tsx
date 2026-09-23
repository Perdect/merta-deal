import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, children, as: Tag = "div", interactive, ...props }: React.HTMLAttributes<HTMLDivElement> & { as?: React.ElementType; interactive?: boolean }) {
  return (
    <Tag className={cn("rounded-lg border border-line bg-card shadow-card", interactive && "transition-shadow hover:shadow-float", className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4 pb-2 sm:px-5", className)}>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 pb-4 sm:px-5", className)}>{children}</div>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-line", className)} />;
}

export function SectionHeader({ title, subtitle, href, hrefLabel = "See all", className, action }: { title: string; subtitle?: string; href?: string; hrefLabel?: string; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3 px-4 sm:px-0", className)}>
      <div>
        <h2 className="text-lg font-bold text-ink sm:text-xl">{title}</h2>
        {subtitle ? <p className="text-sm text-ink-3">{subtitle}</p> : null}
      </div>
      {action ?? (href ? <a href={href} className="text-sm font-semibold text-brand-600 hover:underline">{hrefLabel}</a> : null)}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "neutral", icon, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "neutral" | "brand" | "saffron" | "danger" | "success"; icon?: React.ReactNode; className?: string }) {
  const tones = { neutral: "bg-card", brand: "bg-brand-50", saffron: "bg-saffron-50", danger: "bg-danger-50", success: "bg-success-50" };
  return (
    <div className={cn("rounded-lg border border-line p-4 shadow-card", tones[tone], className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
        {icon ? <span className="text-ink-3">{icon}</span> : null}
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}
