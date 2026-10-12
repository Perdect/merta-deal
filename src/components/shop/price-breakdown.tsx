import type { CartSummary } from "@/types/app";
import { formatINR } from "@/lib/utils";
import { KeyValue } from "@/components/ui/misc";

export function PriceBreakdown({ s, className }: { s: CartSummary; className?: string }) {
  const items = [
    { label: `Item total (${s.item_count})`, value: formatINR(s.subtotal) },
    ...(s.item_savings > 0 ? [{ label: "Savings on MRP", value: <span className="text-success">− {formatINR(s.item_savings)}</span> }] : []),
    ...(s.coupon_discount > 0 ? [{ label: `Coupon (${s.coupon?.code})`, value: <span className="text-success">− {formatINR(s.coupon_discount)}</span> }] : []),
    { label: "Delivery fee", value: s.delivery_fee === 0 ? <span className="text-success">FREE</span> : formatINR(s.delivery_fee) },
    ...(s.express_fee > 0 ? [{ label: "Express delivery", value: formatINR(s.express_fee) }] : []),
    // Fees are settings (platform_fee, tax_rate_percent); when switched off they are not listed at ₹0.
    ...(s.platform_fee > 0 ? [{ label: "Platform fee", value: formatINR(s.platform_fee) }] : []),
    ...(s.tax > 0 ? [{ label: `GST on fees (${s.tax_rate}%)`, value: formatINR(s.tax, { precise: true }) }] : []),
    { label: "To pay", value: formatINR(s.total, { precise: true }), strong: true },
  ];
  return <KeyValue items={items} className={className} />;
}

export function FreeDeliveryBar({ s }: { s: CartSummary }) {
  if (s.free_delivery_threshold <= 0) return null;
  const pct = Math.min(100, Math.round((s.subtotal / s.free_delivery_threshold) * 100));
  return (
    <div className="rounded-md bg-brand-50 px-3.5 py-3">
      <p className="text-sm font-semibold text-brand-800">{s.free_delivery_gap > 0 ? <>You are {formatINR(s.free_delivery_gap)} away from <span className="uppercase">free delivery</span>.</> : <>🎉 You&apos;ve unlocked FREE delivery</>}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
