import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Inbox, Info, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  return <Loader2 className={cn("animate-spin text-brand-600", className)} style={{ width: size, height: size }} aria-label="Loading" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function LoadingState({ label = "Loading…", className, rows = 3 }: { label?: string; className?: string; rows?: number }) {
  return (
    <div className={cn("space-y-3 p-4", className)} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-16 w-16 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-line bg-card p-2.5">
          <Skeleton className="aspect-square w-full rounded-md" />
          <Skeleton className="mt-3 h-3 w-1/3" />
          <Skeleton className="mt-2 h-4 w-5/6" />
          <Skeleton className="mt-2 h-4 w-1/2" />
          <Skeleton className="mt-3 h-9 w-full rounded-sm" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className, compact }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-16", className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-ink-3">{icon ?? <Inbox className="h-7 w-7" />}</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, onRetry, retryHref, className }: { title?: string; description?: React.ReactNode; onRetry?: () => void; retryHref?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)} role="alert">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-50 text-danger"><AlertTriangle className="h-7 w-7" /></div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p> : null}
      {onRetry ? <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}><RefreshCw className="h-4 w-4" /> Try again</Button> : retryHref ? <Button variant="outline" size="sm" className="mt-5" href={retryHref}>Try again</Button> : null}
    </div>
  );
}

const ALERT_ICON = {
  info: <Info className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  danger: <AlertCircle className="h-4 w-4" />,
  success: <CheckCircle2 className="h-4 w-4" />,
  neutral: <Info className="h-4 w-4" />,
};

export function Alert({ tone = "info", title, children, className, icon }: { tone?: "info" | "warning" | "danger" | "success" | "neutral"; title?: string; children?: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  const tones = {
    info: "border-info/20 bg-info-50 text-[#1e3a8a]",
    warning: "border-warning/30 bg-warning-50 text-[#6b4d00]",
    danger: "border-danger/20 bg-danger-50 text-[#8a1f18]",
    success: "border-success/20 bg-success-50 text-[#14532d]",
    neutral: "border-line bg-surface-2 text-ink-2",
  };
  return (
    <div className={cn("flex gap-3 rounded-md border px-3.5 py-3 text-sm", tones[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      {/* Status is never colour-only: every tone carries an icon (callers may pass their own). */}
      <span className="mt-0.5 shrink-0" aria-hidden>{icon ?? ALERT_ICON[tone]}</span>
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
      </div>
    </div>
  );
}
