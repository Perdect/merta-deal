"use client";
import * as React from "react";
import { ShoppingBag, TicketPercent, X } from "lucide-react";
import type { CartSummary } from "@/types/app";
import { addToCartAction, applyCouponAction, getCartSummary, removeCouponAction } from "@/lib/actions/cart";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { CartItem } from "./cart-item";
import { PriceBreakdown, FreeDeliveryBar } from "./price-breakdown";
import { formatINR } from "@/lib/utils";

export function CartView({ initial, coupons }: { initial: CartSummary | null; coupons: { code: string; title: string; min_order_amount: number }[] }) {
  const summary = useCartStore((s) => s.summary) ?? initial;
  const setSummary = useCartStore((s) => s.setSummary);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [couponBusy, setCouponBusy] = React.useState(false);
  React.useEffect(() => { setSummary(initial); }, [initial, setSummary]);

  const refresh = async () => setSummary(await getCartSummary());
  const onQty = async (inventoryId: string, qty: number) => {
    setBusyId(inventoryId);
    const r = await addToCartAction(inventoryId, qty);
    if (!r.ok) toast.error(r.error);
    await refresh(); setBusyId(null);
  };
  const apply = async (c = code) => {
    if (!c.trim()) return;
    setCouponBusy(true);
    const r = await applyCouponAction(c);
    if (r.ok) { toast.success(`Coupon applied — you save ${formatINR(r.data.discount)}`); setCode(""); } else toast.error(r.error);
    await refresh(); setCouponBusy(false);
  };
  const remove = async () => { setCouponBusy(true); await removeCouponAction(); await refresh(); setCouponBusy(false); };

  if (!summary || summary.empty || !summary.items.length) {
    return <EmptyState icon={<ShoppingBag className="h-7 w-7" />} title="Your cart is empty" description="Add groceries, fruits and vegetables — delivered in minutes." action={<Button href="/categories">Start shopping</Button>} />;
  }

  return (
    <div className="grid gap-5 px-4 sm:px-0 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <FreeDeliveryBar s={summary} />
        <ul className="divide-y divide-line rounded-lg border border-line bg-card px-4">
          {summary.items.map((line) => <CartItem key={line.id} line={line} onQty={onQty} busy={busyId === line.inventory_id} />)}
        </ul>

        <div className="rounded-lg border border-line bg-card p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><TicketPercent className="h-4 w-4 text-saffron-600" /> Coupons & offers</p>
          {summary.coupon?.valid && summary.coupon_discount > 0 ? (
            <div className="flex items-center justify-between rounded-md bg-success-50 px-3 py-2.5 text-sm"><span className="font-semibold text-brand-800">{summary.coupon.code} applied · −{formatINR(summary.coupon_discount)}</span><button type="button" onClick={remove} disabled={couponBusy} className="text-ink-3 hover:text-danger" aria-label="Remove coupon"><X className="h-4 w-4" /></button></div>
          ) : (
            <div className="flex gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter coupon code" aria-label="Coupon code" wrapperClassName="flex-1" />
              <Button variant="secondary" onClick={() => apply()} loading={couponBusy}>Apply</Button>
            </div>
          )}
          {summary.coupon && !summary.coupon.valid ? <p className="mt-2 text-xs text-danger">{summary.coupon.reason}</p> : null}
          {coupons.length && !(summary.coupon?.valid) ? (
            <div className="scroll-x mt-3">
              {coupons.map((c) => <button key={c.code} type="button" onClick={() => apply(c.code)} className="rounded-md border border-dashed border-saffron-500 bg-saffron-50 px-3 py-2 text-left"><span className="block text-xs font-bold text-saffron-700">{c.code}</span><span className="block text-[11px] text-ink-2">{c.title}</span></button>)}
            </div>
          ) : null}
        </div>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-lg border border-line bg-card p-4">
          <h2 className="mb-3 text-base font-bold text-ink">Bill details</h2>
          <PriceBreakdown s={summary} />
          {!summary.meets_min_order ? <p className="mt-3 rounded-md bg-warning-50 px-3 py-2 text-xs font-medium text-[#6b4d00]">Minimum order is {formatINR(summary.min_order_amount)}. Add {formatINR(summary.min_order_amount - summary.subtotal)} more to checkout.</p> : null}
          {summary.issues.length ? <p className="mt-3 rounded-md bg-danger-50 px-3 py-2 text-xs font-medium text-[#8a1f18]">Some items exceed available stock. Please adjust quantities.</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" href="/categories">Continue shopping</Button>
          <Button size="lg" href="/checkout" disabled={!summary.meets_min_order || summary.issues.length > 0}>Checkout</Button>
        </div>
        <p className="text-center text-[11px] text-ink-3">Delivery fee and ETA are confirmed at checkout based on your address.</p>
      </aside>
    </div>
  );
}
