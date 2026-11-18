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

/** Quick-commerce steps shown to shoppers: placed → packing → on the way → delivered (admin keeps the full timeline). */
export const CUSTOMER_STEPS: { key: string; label: string; icon: string; statuses: OrderStatusType[] }[] = [
  { key: "placed", label: "Order placed", icon: "receipt", statuses: ["placed"] },
  { key: "packing", label: "Packing", icon: "package", statuses: ["confirmed", "preparing", "ready_for_pickup"] },
  { key: "on_the_way", label: "On the way", icon: "bike", statuses: ["rider_assigned", "out_for_delivery"] },
  { key: "delivered", label: "Delivered", icon: "check-circle", statuses: ["delivered", "completed"] },
];

function stepNote(status: OrderStatusType, paid: boolean) {
  switch (status) {
    case "placed": return paid ? "Confirming your order" : "Waiting for your online payment";
    case "confirmed": case "preparing": return "Merta Deal is packing your items";
    case "ready_for_pickup": return "Packed · assigning a delivery partner";
    case "rider_assigned": return "Delivery partner is picking up your order";
    case "out_for_delivery": return "On the way to you · share the OTP at your door";
    case "delivered": case "completed": return "Handed over after OTP check";
    default: return "";
  }
}

export function CustomerOrderSteps({ status, history, promisedAt, paid = true, className }: { status: OrderStatusType; history: OrderHistoryEntry[]; promisedAt?: string | null; paid?: boolean; className?: string }) {
  if (status === "cancelled" || status === "rejected") {
    const end = history.find((h) => h.status === status);
    return (
      <div className={cn("flex gap-3 rounded-lg bg-danger-50 p-3", className)}>
        <DynamicIcon name="x-circle" className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div className="min-w-0"><p className="text-sm font-semibold text-ink">{ORDER_STATUS_META[status].label}{end ? <time className="ml-2 text-xs font-normal text-ink-3 tabular">{formatTime(end.created_at)}</time> : null}</p><p className="text-xs text-ink-2">{end?.note || ORDER_STATUS_META[status].description}</p></div>
      </div>
    );
  }
  const current = CUSTOMER_STEPS.findIndex((s) => s.statuses.includes(status));
  const firstAt = (statuses: OrderStatusType[]) => history.filter((h) => statuses.includes(h.status)).map((h) => h.created_at).sort()[0];
  return (
    <ol className={cn("relative", className)}>
      {CUSTOMER_STEPS.map((s, i) => {
        const done = i < current; const active = i === current; const at = i <= current ? firstAt(s.statuses) : undefined;
        return (
          <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0" aria-current={active ? "step" : undefined}>
            {i < CUSTOMER_STEPS.length - 1 ? <span className={cn("absolute left-[15px] top-8 h-[calc(100%-16px)] w-0.5", done ? "bg-brand-500" : "bg-line-2")} aria-hidden /> : null}
            <span className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2", done || active ? "border-brand-600 bg-brand-600 text-white" : "border-line-2 bg-card text-ink-4", active && "ring-4 ring-brand-100")}>
              {done || (active && s.key === "delivered") ? <Check className="h-4 w-4" /> : <DynamicIcon name={s.icon} className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-sm font-semibold", done || active ? "text-ink" : "text-ink-3")}>{s.label}</p>
                {at ? <time className="text-xs text-ink-3 tabular">{formatTime(at)}</time> : s.key === "delivered" && promisedAt ? <span className="text-xs text-ink-3">ETA {formatTime(promisedAt)}</span> : null}
              </div>
              {active ? <p className="text-xs text-ink-2">{stepNote(status, paid)}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
