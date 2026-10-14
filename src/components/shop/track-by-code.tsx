"use client";
import { DeliveryOtpStrip } from "./delivery-otp-strip";
import * as React from "react";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { OrderHistoryEntry, OrderStatus } from "@/types/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { CustomerOrderSteps, OrderStatusBadge } from "./order-status";
import { formatINR, formatDateTime } from "@/lib/utils";

type Result = { order: { id: string; order_number: string; short_code: string; status: OrderStatus; total: number; item_count: number; payment_method: string; payment_status: string; promised_at: string | null; created_at: string }; store: { name: string; area: string; phone: string }; items: { name: string; quantity: number; pack_label: string | null; line_total: number }[]; history: OrderHistoryEntry[]; delivery_otp: string | null; rider: { name: string | null; vehicle_number: string | null } | null };

export function TrackByCode() {
  const [code, setCode] = React.useState(""); const [phone, setPhone] = React.useState("");
  const [busy, setBusy] = React.useState(false); const [res, setRes] = React.useState<Result | null | undefined>(undefined);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { data } = await createClient().rpc("track_order_by_code", { p_code: code.trim(), p_phone: phone });
    setRes((data as unknown as Result) ?? null); setBusy(false);
  };
  return (
    <div className="px-4 sm:px-0 sm:max-w-lg">
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-line bg-card p-4">
        <Input label="Order number or code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MD2609001001 or A1B2C3" required />
        <Input label="Mobile number" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" required />
        <Button type="submit" fullWidth loading={busy}><Search className="h-4 w-4" /> Track</Button>
      </form>
      {res === null ? <Alert tone="warning" className="mt-3">No order found for that code and mobile number.</Alert> : null}
      {res ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-line bg-card p-4">
            <div className="flex items-start justify-between gap-2"><div><p className="text-xs text-ink-3">{res.order.order_number} · {formatDateTime(res.order.created_at)}</p><p className="text-base font-bold text-ink">{res.store.name}</p><p className="text-xs text-ink-3">{res.store.area}</p></div><OrderStatusBadge status={res.order.status} /></div>
            {res.order.status === "out_for_delivery" ? <DeliveryOtpStrip otp={res.delivery_otp} /> : null}
            {res.rider ? <p className="mt-2 text-xs text-ink-2">Rider: {res.rider.name}{res.rider.vehicle_number ? ` · ${res.rider.vehicle_number}` : ""}</p> : null}
            <ul className="mt-3 divide-y divide-line text-sm">{res.items.map((i, k) => <li key={k} className="flex justify-between py-1.5"><span className="text-ink-2">{i.quantity} × {i.name}</span><span className="tabular">{formatINR(i.line_total)}</span></li>)}</ul>
            <p className="mt-2 text-right text-sm font-bold">Total {formatINR(res.order.total, { precise: true })}</p>
          </div>
          <div className="rounded-lg border border-line bg-card p-4"><CustomerOrderSteps status={res.order.status} history={res.history} promisedAt={["delivered", "completed", "cancelled", "rejected"].includes(res.order.status) ? null : res.order.promised_at} /></div>
        </div>
      ) : null}
    </div>
  );
}
