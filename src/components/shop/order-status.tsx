import { Check } from "lucide-react";
import type { OrderHistoryEntry, OrderStatus as OrderStatusType } from "@/types/app";
import { ORDER_FLOW, ORDER_STATUS_META, statusIndex } from "@/lib/order-status";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { cn, formatTime } from "@/lib/utils";

const TONE: Record<string, BadgeTone> = { neutral: "neutral", info: "info", warning: "warning", success: "success", danger: "danger" };

export function OrderStatusBadge({ status, size = "sm" }: { status: OrderStatusType; size?: "xs" | "sm" | "md" }) {
  const m = ORDER_STATUS_META[status];
  return <Badge tone={TONE[m.tone]} size={size}>{m.short}</Badge>;
}

/** Vertical visual timeline of the order lifecycle. */
export function OrderTimeline({ status, history, promisedAt, className }: { status: OrderStatusType; history: OrderHistoryEntry[]; promisedAt?: string | null; className?: string }) {
  const terminalBad = status === "cancelled" || status === "rejected";
  const current = terminalBad ? -1 : statusIndex(status);
  const byStatus = new Map(history.map((h) => [h.status, h]));
  const steps = terminalBad ? [...ORDER_FLOW.slice(0, Math.max(1, history.filter((h) => ORDER_FLOW.includes(h.status)).length)), status] : ORDER_FLOW;
  return (
    <ol className={cn("relative", className)}>
      {steps.map((s, i) => {
        const meta = ORDER_STATUS_META[s]; const entry = byStatus.get(s);
        const done = terminalBad ? Boolean(entry) : i <= current; const active = terminalBad ? s === status : i === current;
        const bad = s === "cancelled" || s === "rejected";
        return (
          <li key={s} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 ? <span className={cn("absolute left-[15px] top-8 h-[calc(100%-16px)] w-0.5", done && !active ? "bg-brand-500" : "bg-line-2")} aria-hidden /> : null}
            <span className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2", bad ? "border-danger bg-danger text-white" : done ? "border-brand-600 bg-brand-600 text-white" : "border-line-2 bg-card text-ink-4", active && !bad && "ring-4 ring-brand-100")}>
              {done && !active && !bad ? <Check className="h-4 w-4" /> : <DynamicIcon name={meta.icon} className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-sm font-semibold", done || active ? "text-ink" : "text-ink-3")}>{meta.label}</p>
                {entry ? <time className="text-xs text-ink-3 tabular">{formatTime(entry.created_at)}</time> : active && promisedAt && s !== "delivered" ? <span className="text-xs text-ink-3">ETA {formatTime(promisedAt)}</span> : null}
              </div>
              <p className="text-xs text-ink-3">{entry?.note ?? meta.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
