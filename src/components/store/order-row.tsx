import Link from "next/link";
import { ChevronRight, Clock, CreditCard, Banknote, CalendarClock, Zap } from "lucide-react";
import { OrderStatusBadge } from "@/components/shop/order-status";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { formatINR, formatTime, timeAgo, cn } from "@/lib/utils";
import { isPaymentPending } from "./constants";
import type { StoreOrderRow } from "@/lib/data/store";

export function customerFromSnapshot(snapshot: unknown) {
  const s = (snapshot ?? {}) as { full_name?: string; phone?: string; area?: string; house?: string; street?: string; landmark?: string; city?: string; pincode?: string };
  return { name: s.full_name ?? "Customer", phone: s.phone ?? "", area: s.area ?? "", line: [s.house, s.street, s.area, s.landmark].filter(Boolean).join(", "), city: s.city ?? "", pincode: s.pincode ?? "" };
}

/** Payment method + status chip; highlights unpaid online orders (they cannot be accepted yet). */
export function PaymentBadge({ method, status, size = "xs" }: { method: StoreOrderRow["payment_method"]; status: StoreOrderRow["payment_status"]; size?: "xs" | "sm" }) {
  const unpaid = isPaymentPending({ payment_method: method, payment_status: status });
  const tone = unpaid ? "warning" : status === "failed" || status === "refunded" ? "danger" : method === "cod" ? "neutral" : "success";
  return <Badge tone={tone} size={size}>{method === "cod" ? <Banknote className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}{method === "cod" ? "COD" : PAYMENT_METHOD_LABEL[method].replace(" (Razorpay)", "")} · {unpaid ? "Payment pending" : PAYMENT_STATUS_LABEL[status]}</Badge>;
}

/** Compact order line for lists (server-safe). `children` is the action slot. */
export function OrderRow({ order, children, className }: { order: StoreOrderRow; children?: React.ReactNode; className?: string }) {
  const c = customerFromSnapshot(order.address_snapshot);
  const scheduled = order.delivery_type === "scheduled" && order.scheduled_slot_start;
  return (
    <li className={cn("rounded-lg border border-line bg-card shadow-card", order.status === "placed" && "border-brand-200 ring-1 ring-brand-100", className)}>
      <Link href={`/store/orders/${order.id}`} className="block p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink">{order.order_number}{order.delivery_type === "express" ? <Badge tone="saffron" size="xs"><Zap className="h-3 w-3" /> Express</Badge> : null}{scheduled ? <Badge tone="info" size="xs"><CalendarClock className="h-3 w-3" /> {formatTime(order.scheduled_slot_start)}</Badge> : null}</p>
            <p className="mt-0.5 text-xs text-ink-3"><Clock className="mr-1 inline h-3 w-3" />{timeAgo(order.created_at)} · {c.name}{c.area ? ` · ${c.area}` : ""}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1"><OrderStatusBadge status={order.status} /><span className="text-sm font-bold tabular text-ink">{formatINR(order.total)}</span></div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
          <span className="flex flex-wrap items-center gap-1.5">{order.item_count} item{order.item_count === 1 ? "" : "s"} <PaymentBadge method={order.payment_method} status={order.payment_status} /></span>
          <span className="inline-flex items-center gap-0.5 font-semibold text-brand-700">Details <ChevronRight className="h-3.5 w-3.5" /></span>
        </div>
      </Link>
      {children ? <div className="border-t border-line px-3.5 py-2.5 sm:px-4">{children}</div> : null}
    </li>
  );
}
