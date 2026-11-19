"use client";
import * as React from "react";
import { ShoppingBag, TicketPercent, X } from "lucide-react";
import type { Address, CartSummary } from "@/types/app";
import { applyCouponAction, getCartSummary, removeCouponAction } from "@/lib/actions/cart";
import { setLineQuantity } from "@/lib/cart-sync";
import { useCartStore } from "@/stores/cart-store";
import { useCheckoutStore } from "@/stores/checkout-store";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, EmptyState } from "@/components/ui/states";
import { CartItem } from "./cart-item";
import { PriceBreakdown, FreeDeliveryBar } from "./price-breakdown";
import { DeliveryAddressRow, useCheckoutGate } from "./checkout-gate";
import { formatINR } from "@/lib/utils";

/**
 * The full /cart page (deep links, desktop). Same steps as the cart panel: address first, sign in only
 * at "Proceed to Pay", then the payment step opens in the panel. Totals are for the chosen address.
 */
export function CartView({ initial, coupons, addresses, signedIn, isGuest, verifyMobile = false }: { initial: CartSummary | null; coupons: { code: string; title: string; min_order_amount: number }[]; addresses: Address[]; signedIn: boolean; isGuest: boolean; verifyMobile?: boolean }) {
  const summary = useCartStore((s) => s.summary) ?? initial;
  const setSummary = useCartStore((s) => s.setSummary);
  const openSheet = useCartStore((s) => s.openSheet);
  const deliveryType = useCheckoutStore((s) => s.deliveryType);
  const gate = useCheckoutGate({ summary, addresses, signedIn, isGuest, verifyMobile });
  const { addressId, selectedAddress } = gate;
  const [code, setCode] = React.useState("");
  const [couponBusy, setCouponBusy] = React.useState(false);
  React.useEffect(() => { setSummary(initial); }, [initial, setSummary]);
  // Delivery fee and ETA follow the chosen address.
  React.useEffect(() => {
    if (!signedIn) return;
    getCartSummary(addressId, deliveryType).then((s) => { if (s) setSummary(s); });
  }, [addressId, deliveryType, signedIn, setSummary]);

  const refresh = async () => setSummary(await getCartSummary(addressId, deliveryType));
  const onQty = (inventoryId: string, qty: number) => { void setLineQuantity(inventoryId, qty); };
  const apply = async (c = code) => {
    if (!c.trim()) return;
    setCouponBusy(true);
    const r = await applyCouponAction(c);
    if (r.ok) { toast.success(`Coupon applied — you save ${formatINR(r.data.discount)}`); setCode(""); } else toast.error(r.error);
    await refresh(); setCouponBusy(false);
  };
  const remove = async () => { setCouponBusy(true); await removeCouponAction(); await refresh(); setCouponBusy(false); };

  if (!summary || summary.empty || !summary.items.length) {
    return <EmptyState icon={<ShoppingBag className="h-7 w-7" />} title="Your cart is empty" description="Add groceries, sweets and cakes — delivered in minutes." action={<Button href="/categories">Start shopping</Button>} />;
  }

  return (
    <div className="grid grid-cols-1 gap-5 px-4 sm:px-0 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        {selectedAddress ? (
          <div className="rounded-lg border border-line bg-card px-4 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Delivering to</p>
            <DeliveryAddressRow address={selectedAddress} unserved={gate.unserved} serviceMessage={gate.serviceMessage} onChange={() => openSheet("address")} />
          </div>
        ) : null}
        <FreeDeliveryBar s={summary} />
        <ul className="divide-y divide-line rounded-lg border border-line bg-card px-4">
          {summary.items.map((line) => <CartItem key={line.id} line={line} onQty={onQty} issue={summary.issues.find((i) => i.inventory_id === line.inventory_id)} />)}
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
          {gate.cartBlocker && selectedAddress ? <Alert tone="warning" className="mt-3">{gate.cartBlocker}</Alert> : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" href="/categories">Continue shopping</Button>
          <Button size="lg" disabled={gate.ctaDisabled} onClick={() => void gate.proceed()}>{gate.ctaLabel}</Button>
        </div>
        <p className="text-center text-[11px] text-ink-3">{selectedAddress ? gate.needsLogin ? "You'll sign in with your mobile number before paying. Your cart and address are kept." : "Delivery fee and ETA above are for the selected address." : "Add a delivery address to see the delivery fee and ETA."}</p>
      </aside>
    </div>
  );
}
