"use client";
import * as React from "react";
import { Copy, Check, Ticket } from "lucide-react";
import type { Coupon } from "@/types/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { formatINR, formatDate } from "@/lib/utils";

export function couponValueLabel(c: Pick<Coupon, "type" | "value" | "max_discount">) {
  if (c.type === "percentage") return `${Number(c.value)}% off${c.max_discount ? ` up to ${formatINR(c.max_discount)}` : ""}`;
  return `${formatINR(c.value)} off`;
}

function isExpiringSoon(expiresAt: string | null) {
  return expiresAt ? new Date(expiresAt).getTime() - Date.now() < 3 * 86400 * 1000 : false;
}

/** Available coupon with a one-tap "Copy code" (used at checkout). */
export function CouponCard({ coupon }: { coupon: Coupon }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(coupon.code); setCopied(true); toast.success(`Code ${coupon.code} copied`, "Apply it in the cart or at checkout."); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error("Could not copy", `Type the code ${coupon.code} at checkout.`); }
  };
  const expiringSoon = isExpiringSoon(coupon.expires_at);
  return (
    <article className="flex overflow-hidden rounded-lg border border-line bg-card shadow-card">
      <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-1 border-r border-dashed border-line-2 bg-brand-50 text-brand-700"><Ticket className="h-5 w-5" /><span className="text-[10px] font-bold uppercase tracking-wide">Offer</span></div>
      <div className="min-w-0 flex-1 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-bold text-ink">{couponValueLabel(coupon)}</p>
          {coupon.first_order_only ? <Badge tone="saffron" size="xs">First order</Badge> : null}
          {expiringSoon ? <Badge tone="warning" size="xs">Ends soon</Badge> : null}
        </div>
        <p className="mt-0.5 text-sm font-semibold text-ink-2">{coupon.title}</p>
        {coupon.description ? <p className="mt-0.5 text-xs text-ink-3">{coupon.description}</p> : null}
        <p className="mt-1.5 text-xs text-ink-3">
          {Number(coupon.min_order_amount) > 0 ? `Min. order ${formatINR(coupon.min_order_amount)}` : "No minimum order"}
          {coupon.expires_at ? ` · Valid till ${formatDate(coupon.expires_at)}` : ""}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <code className="rounded-xs border border-dashed border-brand-300 bg-brand-50 px-2.5 py-1 text-sm font-bold tracking-wider text-brand-700">{coupon.code}</code>
          <Button size="xs" variant={copied ? "secondary" : "primary"} onClick={copy}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy code"}</Button>
        </div>
      </div>
    </article>
  );
}
