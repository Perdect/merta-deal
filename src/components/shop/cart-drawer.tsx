"use client";
import * as React from "react";
import Link from "next/link";
import Script from "next/script";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, X, Clock, TicketPercent, ReceiptText, Check, Plus, Home, Briefcase, MapPin, Zap, CalendarClock, Smartphone, CreditCard, Landmark, Wallet, Banknote, ShoppingBag, BadgePercent, Truck } from "lucide-react";
import type { Address, CartLine, PaymentMethod, ProductCard as ProductCardType } from "@/types/app";
import { applyCouponAction, getCartSummary, removeCouponAction } from "@/lib/actions/cart";
import { packLimit, setLineQuantity } from "@/lib/cart-sync";
import { placeOrderAction } from "@/lib/actions/checkout";
import { orderNote } from "@/lib/destinations";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useCartStore } from "@/stores/cart-store";
import { useCheckoutStore } from "@/stores/checkout-store";
import { useLocationStore, adoptAddress } from "@/stores/location-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { QuantityStepper } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { AddressSheet, addressLine, addressTitle } from "./address-sheet";
import { DeliveryAddressRow, useCheckoutGate } from "./checkout-gate";
import { ProductImage } from "./product-image";
import { ProductCard } from "./product-card";
import { LoginModal } from "@/components/auth/login-modal";
import { cn, formatINR } from "@/lib/utils";
import { etaText } from "@/lib/eta";
import { site } from "@/config/site";

declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void } } }

type Coupon = { code: string; title: string; min_order_amount: number };
type Props = {
  signedIn: boolean; isGuest: boolean; addresses: Address[]; walletBalance: number; razorpayEnabled: boolean; codEnabled: boolean; slots: string[];
  coupons: Coupon[]; user: { name: string | null; phone: string | null }; eta: { min: number; max: number };
};
const TYPE_ICON = { home: Home, work: Briefcase, other: MapPin };
const ONLINE: PaymentMethod[] = ["upi", "card", "netbanking"];

function Row({ label, sub, value, strike, strong }: { label: string; sub?: React.ReactNode; value: React.ReactNode; strike?: number; strong?: boolean }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 py-2", strong && "border-t border-line pt-3")}>
      <div className="min-w-0"><p className={cn("text-sm", strong ? "text-base font-bold text-ink" : "text-ink-2")}>{label}</p>{sub ? <p className="text-xs text-info">{sub}</p> : null}</div>
      <p className={cn("shrink-0 tabular text-sm", strong ? "text-base font-bold text-ink" : "text-ink")}>{strike && strike > 0 ? <span className="mr-1.5 text-xs text-ink-3 line-through">{formatINR(strike)}</span> : null}{value}</p>
    </div>
  );
}
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-line bg-card", className)}>{children}</section>;
}
function Radio({ on }: { on: boolean }) {
  return <span aria-hidden className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", on ? "border-brand-600 bg-brand-600" : "border-line-2 bg-card")}>{on ? <Check className="h-3 w-3 text-white" /> : null}</span>;
}
function PayRow({ id, current, onPick, icon, title, sub, disabled }: { id: PaymentMethod; current: PaymentMethod; onPick: (m: PaymentMethod) => void; icon: React.ReactNode; title: string; sub?: string; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onPick(id)} className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left", disabled && "opacity-50")}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-ink">{title}</span>{sub ? <span className="block text-xs text-ink-3">{sub}</span> : null}</span>
      <Radio on={current === id} />
    </button>
  );
}

/**
 * The cart as a slide-in panel over whatever page the customer is on, with the payment step as a
 * second screen inside the same panel. The order of steps is shop → address → sign in → pay (see
 * useCheckoutGate): guests fill the cart and pick an address first and are only asked to sign in at
 * "Proceed to Pay". All totals come from cart_summary for the chosen address; placing the order goes
 * through place_order — this component only arranges them. The address and sign-in sheets live here
 * too and open from any page (cart store `sheet`), the panel itself need not be open.
 */
export function CartDrawer({ signedIn, isGuest, addresses: serverAddresses, walletBalance, razorpayEnabled, codEnabled, slots, coupons, user, eta }: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const step = useCartStore((s) => s.drawer);
  const openDrawer = useCartStore((s) => s.openDrawer);
  const closeDrawer = useCartStore((s) => s.closeDrawer);
  const sheet = useCartStore((s) => s.sheet);
  const openSheet = useCartStore((s) => s.openSheet);
  const closeSheet = useCartStore((s) => s.closeSheet);
  const leavingForOrder = useBackToClose(Boolean(step), closeDrawer);
  const summary = useCartStore((s) => s.summary);
  const setSummary = useCartStore((s) => s.setSummary);
  const location = useLocationStore((s) => s.location);

  const setAddressId = useCheckoutStore((s) => s.setAddressId);
  const addAddress = useCheckoutStore((s) => s.addAddress);
  const deliveryType = useCheckoutStore((s) => s.deliveryType);
  const setDeliveryType = useCheckoutStore((s) => s.setDeliveryType);
  const instructions = useCheckoutStore((s) => s.instructions);
  const setInstructions = useCheckoutStore((s) => s.setInstructions);
  const giftMessage = useCheckoutStore((s) => s.giftMessage);
  const setGiftMessage = useCheckoutStore((s) => s.setGiftMessage);
  const resume = useCheckoutStore((s) => s.resume);
  const setResume = useCheckoutStore((s) => s.setResume);
  const gate = useCheckoutGate({ summary, addresses: serverAddresses, signedIn, isGuest });
  const { addresses, addressId, selectedAddress } = gate;

  const [slot, setSlot] = React.useState(slots[0] ?? "");
  const [payment, setPayment] = React.useState<PaymentMethod>(codEnabled ? "cod" : razorpayEnabled ? "upi" : "wallet");
  const pending = useCartStore((st) => st.pending);
  const notice = useCartStore((st) => st.notice);
  const setNotice = useCartStore((st) => st.setNotice);
  const placingRef = React.useRef(false);
  const [code, setCode] = React.useState("");
  const [couponBusy, setCouponBusy] = React.useState(false);
  const [placing, setPlacing] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<ProductCardType[]>([]);

  const s = summary;
  // Express can only stay selected while the delivery zone offers it.
  if (deliveryType === "express" && s && !s.zone?.express_supported) setDeliveryType("standard");
  const items = s?.items ?? [];
  const open = Boolean(step);
  const account = signedIn && !isGuest;
  // The payment step needs an account: a guest who lands here (e.g. Back after signing out) goes to the cart.
  React.useEffect(() => { if (step === "pay" && !account) openDrawer("cart"); }, [step, account, openDrawer]);
  React.useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeDrawer(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [open, closeDrawer]);

  // A guest sent to sign in from "Proceed to Pay" comes back signed in: continue to the payment step
  // with the cart and address they had (merge_guest_cart moved both to the account).
  React.useEffect(() => {
    if (resume === "pay" && account && hydrated) { setResume(null); closeSheet(); openDrawer("pay"); }
  }, [resume, account, hydrated, setResume, closeSheet, openDrawer]);

  // Fresh totals whenever the panel opens, the address changes or the delivery option changes: the
  // delivery fee, ETA and serviceability all depend on the address, on the cart step too.
  React.useEffect(() => {
    if (!open || !signedIn) return;
    getCartSummary(addressId, deliveryType).then((s) => { if (s) setSummary(s); });
  }, [open, step, addressId, deliveryType, signedIn, setSummary]);

  // "You might also like": popular in-stock items, loaded once per drawer session.
  const suggestedRef = React.useRef(false);
  const hasItems = items.length > 0;
  React.useEffect(() => {
    if (step !== "cart" || suggestedRef.current || !hasItems) return;
    suggestedRef.current = true;
    fetch(`/api/search?sort=popular&inStock=1`).then((r) => r.json()).then((d: { items?: ProductCardType[] }) => setSuggestions(d.items ?? [])).catch(() => {});
  }, [step, hasItems]);

  const refresh = async () => setSummary(await getCartSummary(addressId, deliveryType));
  // Quantity changes go through the shared queue (optimistic, merged taps, server-checked limits).
  const onQty = (line: CartLine, qty: number) => {
    const lim = packLimit(line.max_order_qty, line.stock_qty);
    if (qty === lim.max && qty > (pending[line.inventory_id] ?? line.quantity)) toast.info(lim.message, "That's the most you can add of this item.");
    void setLineQuantity(line.inventory_id, qty);
  };
  const applyCoupon = async (c = code) => { if (!c.trim()) return; setCouponBusy(true); const r = await applyCouponAction(c); if (r.ok) { toast.success(`Coupon applied — you save ${formatINR(r.data.discount)}`); setCode(""); } else toast.error(r.error); await refresh(); setCouponBusy(false); };
  const removeCoupon = async () => { setCouponBusy(true); await removeCouponAction(); await refresh(); setCouponBusy(false); };

  const empty = !s || s.empty || !items.length;
  const deliveryWaived = Number(s?.delivery_fee_waived ?? 0);
  const savings = s ? s.item_savings + s.coupon_discount + deliveryWaived : 0;
  // A delivery time is only promised for a served address (cart_summary) or a served picked location.
  const etaLabel = selectedAddress && s?.serviceable ? etaText(s.eta_min_minutes, s.eta_max_minutes) : !selectedAddress && hydrated && location?.serviceable ? etaText(location.etaMin, location.etaMax) : null;
  void eta;
  const headerLine = selectedAddress ? `${addressTitle(selectedAddress)} · ${addressLine(selectedAddress)}` : hydrated && location ? location.label : `Delivering across ${site.city}`;
  const walletOk = walletBalance >= (s?.total ?? 0);

  const payBlocker = !s ? null : !addressId ? "Select or add a delivery address to continue."
    : !s.serviceable ? (s.service_message ?? "We don't deliver to this address yet.")
    : gate.cartBlocker ? gate.cartBlocker
    : deliveryType === "scheduled" && !slot ? "Pick a delivery slot to continue."
    : payment === "wallet" && !walletOk ? "Your wallet balance doesn't cover this order. Choose another payment method."
    : ONLINE.includes(payment) && !razorpayEnabled ? "Online payment isn't available yet. Choose Cash on Delivery."
    : null;

  const scheduledRange = () => {
    if (deliveryType !== "scheduled" || !slot) return {};
    const [a, b] = slot.split("-"); const mk = (t: string) => { const [h, m] = t.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d.toISOString(); };
    return { scheduledStart: mk(a), scheduledEnd: mk(b) };
  };

  // One order per tap: `placingRef` blocks re-entry while the request is in flight (the button also
  // shows a spinner); place_order itself is transactional, so a retry after a failure is safe.
  const place = async () => {
    if (!addressId || !s || placingRef.current) return;
    placingRef.current = true; setPlacing(true);
    const res = await placeOrderAction({ addressId, paymentMethod: payment, deliveryType, instructions: orderNote(instructions, giftMessage), ...scheduledRange() });
    if (!res.ok) {
      // Nothing was ordered and the cart is untouched; reload it so any change (stock, limit, price) shows.
      toast.error(res.error);
      const fresh = await getCartSummary(addressId, deliveryType);
      if (fresh) { setSummary(fresh); if (fresh.issues.length) openDrawer("cart"); }
      placingRef.current = false; setPlacing(false); return;
    }
    const order = res.data;
    const done = (q: string) => { leavingForOrder(); closeDrawer(); setSummary(null); setInstructions(""); setGiftMessage(""); router.replace(`/orders/${order.order_id}?${q}`); };
    if (!order.payment_required) { done("placed=1"); return; }
    try {
      const r = await fetch("/api/payments/razorpay/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.order_id }) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Could not start payment"); done("payment=setup"); return; }
      if (!window.Razorpay) { toast.error("Payment library failed to load. Check your connection."); done("payment=pending"); return; }
      const rzp = new window.Razorpay({
        key: d.keyId, amount: d.amount, currency: d.currency, name: "Merta Deal", description: `Order ${d.orderNumber}`, order_id: d.razorpayOrderId, prefill: d.prefill, theme: { color: "#329537" },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const v = await fetch("/api/payments/razorpay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.order_id, ...resp }) });
          if (v.ok) done("placed=1"); else { const e = await v.json(); toast.error(e.error ?? "Payment verification failed"); done("payment=failed"); }
        },
        modal: { ondismiss: () => { toast.warning("Payment not completed", "Your order is saved; you can retry payment from the order page."); done("payment=pending"); } },
      });
      rzp.open();
    } catch { toast.error("Could not start payment"); done("payment=pending"); }
    setPlacing(false);
  };

  if (!hydrated) return null;

  const sheets = (
    <>
      <AddressSheet open={sheet === "address"} onClose={closeSheet} addresses={addresses} selectedId={addressId} defaultName={user.name} defaultPhone={user.phone}
        onPick={(a, isNew) => { if (isNew) { addAddress(a); router.refresh(); } setAddressId(a.id); void adoptAddress(a); closeSheet(); }} />
      <LoginModal open={sheet === "login" && !account} onClose={() => { closeSheet(); setResume(null); }} eta={`${eta.min}–${eta.max} minutes`} guest={isGuest} title={resume === "pay" ? "Login to place your order" : undefined} />
    </>
  );

  if (!open) return createPortal(sheets, document.body);

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={step === "pay" ? "Payment options" : "Cart"}>
      {razorpayEnabled ? <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" /> : null}
      <div className="absolute inset-0 bg-ink/50 animate-fade-in" onClick={closeDrawer} />
      <aside className="absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-float animate-slide-in-right sm:w-[460px]">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-line bg-card px-3 py-3" style={{ paddingTop: "calc(var(--safe-top) + 12px)" }}>
          <button type="button" onClick={step === "pay" ? () => openDrawer("cart") : closeDrawer} aria-label={step === "pay" ? "Back to cart" : "Close cart"} className="tap flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-card text-ink hover:bg-surface-2"><ChevronLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            {step === "cart" && selectedAddress && !empty ? (
              <DeliveryAddressRow address={selectedAddress} unserved={gate.unserved} serviceMessage={gate.serviceMessage} onChange={() => openSheet("address")} compact />
            ) : (
              <>
                <p className="font-display text-lg font-bold leading-tight text-ink">{step === "pay" ? "Payment Options" : "Cart"}</p>
                <p className="truncate text-xs text-ink-3">{headerLine}</p>
              </>
            )}
          </div>
          <button type="button" onClick={closeDrawer} aria-label="Close" className="hidden h-10 w-10 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 sm:flex"><X className="h-5 w-5" /></button>
        </div>
        {step === "cart" && savings > 0 && !empty ? <div className="bg-success-50 px-4 py-2 text-center text-sm text-brand-800">Yay! You <span className="font-bold">saved {formatINR(savings)}</span> on this order</div> : null}
        {step === "pay" && s ? <div className="border-b border-line bg-card px-4 py-2.5 text-base font-bold text-ink">To Pay: <span className="text-brand-700">{formatINR(s.total, { precise: true })}</span></div> : null}

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {empty ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-ink-3"><ShoppingBag className="h-7 w-7" /></span>
              <p className="mt-4 font-display text-lg font-bold text-ink">Your cart is empty</p>
              <p className="mt-1 text-sm text-ink-3">Add groceries, fruits and vegetables — delivered in minutes.</p>
              <Button className="mt-5 rounded-xl" href="/categories" onClick={closeDrawer}>Start shopping</Button>
            </div>
          ) : step === "cart" && s ? (
            <>
              {notice ? (
                <div className="relative">
                  <Alert tone="info" title={notice.title} className="pr-10">
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">{notice.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                  </Alert>
                  <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="tap absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-[#1e3a8a] hover:bg-info/10"><X className="h-4 w-4" /></button>
                </div>
              ) : null}
              {gate.unserved ? <Alert tone="danger">{gate.serviceMessage ?? "We don't deliver to this address yet."} <button type="button" onClick={() => openSheet("address")} className="font-bold underline underline-offset-2">Change address</button></Alert> : null}
              <Card className="p-4">
                <h3 className="font-display text-base font-bold text-ink">Coupons & offers</h3>
                {s.coupon?.valid && s.coupon_discount > 0 ? (
                  <div className="mt-3 flex items-center gap-3 rounded-xl bg-success-50 px-3 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600 text-white"><BadgePercent className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-brand-800">{s.coupon.code} applied</span><span className="block text-xs text-ink-2">You save {formatINR(s.coupon_discount)}</span></span>
                    <button type="button" onClick={removeCoupon} disabled={couponBusy} className="text-xs font-bold text-danger">Remove</button>
                  </div>
                ) : (
                  <ul className="mt-2 divide-y divide-dashed divide-line">
                    {coupons.slice(0, 2).map((c) => { const gap = c.min_order_amount - s.subtotal; const ok = gap <= 0; return (
                      <li key={c.code} className="flex items-center gap-3 py-3">
                        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", ok ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-3")}><TicketPercent className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-ink">{c.title} with {c.code}</span><span className={cn("block text-xs", ok ? "text-brand-700" : "text-saffron-700")}>{ok ? "Tap apply to use this offer" : <>Shop for <b>{formatINR(gap)}</b> more to apply</>}</span></span>
                        <Button size="sm" variant={ok ? "outline" : "ghost"} disabled={!ok || couponBusy} onClick={() => applyCoupon(c.code)} className={cn("rounded-lg", !ok && "border border-line text-ink-3")}>{ok ? "Apply" : "Locked"}</Button>
                      </li>); })}
                    <li className="flex gap-2 pt-3">
                      <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Have a coupon code?" aria-label="Coupon code" wrapperClassName="flex-1" />
                      <Button variant="secondary" onClick={() => applyCoupon()} loading={couponBusy} disabled={!code.trim()}>Apply</Button>
                    </li>
                  </ul>
                )}
                {s.coupon && !s.coupon.valid ? <p className="mt-2 text-xs text-danger">{s.coupon.reason}</p> : null}
              </Card>

              <Card>
                <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-card text-ink"><Clock className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1"><p className="font-display text-base font-bold text-ink">{etaLabel ? `Delivering in ${etaLabel}` : selectedAddress ? "Delivery time unavailable here" : "Add an address to see delivery time"}</p><p className="text-xs text-ink-3">{s.item_count} item{s.item_count === 1 ? "" : "s"}{selectedAddress ? ` · to ${addressTitle(selectedAddress)}` : ""}</p></div>
                </div>
                <ul className="divide-y divide-line px-4">
                  {items.map((line) => {
                    const qty = pending[line.inventory_id] ?? line.quantity;
                    const lim = packLimit(line.max_order_qty, line.stock_qty);
                    const issue = s.issues.find((i) => i.inventory_id === line.inventory_id);
                    const note = issue
                      ? issue.reason === "unavailable" ? "No longer available. Remove it to continue."
                        : issue.reason === "stock" ? (issue.available_qty > 0 ? `Only ${issue.available_qty} available. Reduce the quantity to continue.` : "Sold out. Remove it to continue.")
                        : `${lim.message}. Reduce the quantity to continue.`
                      : null;
                    return (
                    <li key={line.id} className={cn("flex items-start gap-3 py-3", issue && "opacity-90")}>
                      <Link href={`/p/${line.slug}`} onClick={closeDrawer} className="shrink-0 overflow-hidden rounded-md border border-line"><ProductImage image={line.image_url} brand={line.brand_name} productName={line.name} packSize={line.pack_label} className="h-14 w-14" sizes="56px" /></Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/p/${line.slug}`} onClick={closeDrawer} className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{line.name}</Link>
                        <p className="text-xs text-ink-3">{qty} {qty === 1 ? "pack" : "packs"}{line.pack_label ? ` (${line.pack_label})` : ""}</p>
                        {note ? <p className="mt-0.5 text-xs font-semibold text-danger" role="status">{note}</p>
                          : qty >= lim.max ? <p className="mt-0.5 text-xs font-medium text-saffron-700">{lim.message}</p> : null}
                        {line.price_changed && line.price_at_add != null ? <p className="mt-0.5 text-xs font-medium text-info">Price {Number(line.unit_price) < Number(line.price_at_add) ? "dropped" : "changed"} from {formatINR(line.price_at_add)} to {formatINR(line.unit_price)}</p> : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <QuantityStepper value={qty} onChange={(v) => onQty(line, v)} min={0} max={issue ? Math.min(qty, lim.max) : lim.max} maxLabel={lim.message} size="sm" loading={line.inventory_id in pending} className="rounded-lg" />
                        <p className="tabular text-sm"><span className="mr-1 text-xs text-ink-3 line-through">{line.unit_mrp > line.unit_price ? formatINR(line.unit_mrp * line.quantity) : ""}</span><span className="font-bold text-brand-700">{formatINR(line.line_total)}</span></p>
                      </div>
                    </li>); })}
                </ul>
                <p className="border-t border-line px-4 py-3 text-center text-sm font-semibold text-ink">Forgot something? <Link href="/categories" onClick={closeDrawer} className="font-bold text-brand-700">Add More Items</Link></p>
              </Card>

              <Card>
                <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-card text-ink"><ReceiptText className="h-5 w-5" /></span>
                  <p className="font-display text-base font-bold text-ink">Bill Summary</p>
                </div>
                <div className="px-4 py-1">
                  <Row label="Item Total" value={formatINR(s.subtotal)} strike={s.mrp_total > s.subtotal ? s.mrp_total : undefined} />
                  <Row label="Delivery Fee" value={s.delivery_fee === 0 ? <span className="font-bold text-success">FREE</span> : formatINR(s.delivery_fee)} strike={s.delivery_fee === 0 && deliveryWaived > 0 ? deliveryWaived : undefined} sub={s.free_delivery_threshold > 0 && s.free_delivery_gap > 0 ? `Free above ${formatINR(s.free_delivery_threshold)} (Unlock by adding ${formatINR(s.free_delivery_gap)} more)` : !selectedAddress ? "Confirmed for your address" : undefined} />
                  {s.express_fee > 0 ? <Row label="Express delivery" value={formatINR(s.express_fee)} /> : null}
                  {s.coupon_discount > 0 ? <Row label={`Coupon (${s.coupon?.code})`} value={<span className="text-success">− {formatINR(s.coupon_discount)}</span>} /> : null}
                  {s.platform_fee > 0 ? <Row label="Platform fee" value={formatINR(s.platform_fee)} /> : null}
                  {s.tax > 0 ? <Row label={`GST on fees (${s.tax_rate}%)`} value={formatINR(s.tax, { precise: true })} /> : null}
                  <Row label="To Pay" value={formatINR(s.total, { precise: true })} strike={savings > 0 ? s.total + savings : undefined} strong />
                </div>
              </Card>

              {savings > 0 ? (
                <section className="rounded-2xl border border-success/30 bg-success-50 p-3">
                  <div className="flex items-center justify-between px-1 pb-3"><p className="font-display text-base font-bold text-ink">Savings on this order</p><span className="rounded-md bg-brand-600 px-2.5 py-1 text-sm font-bold text-white">{formatINR(savings)}</span></div>
                  <div className="divide-y divide-dashed divide-line rounded-xl bg-card px-3">
                    {[
                      { show: s.item_savings > 0, icon: <BadgePercent className="h-3.5 w-3.5" />, label: "Discount on MRP", value: s.item_savings },
                      { show: s.coupon_discount > 0, icon: <TicketPercent className="h-3.5 w-3.5" />, label: `Coupon ${s.coupon?.code ?? ""}`.trim(), value: s.coupon_discount },
                      { show: deliveryWaived > 0, icon: <Truck className="h-3.5 w-3.5" />, label: "FREE delivery savings", value: deliveryWaived },
                    ].filter((r) => r.show).map((r) => (
                      <div key={r.label} className="flex items-center justify-between py-2.5 text-sm">
                        <span className="flex items-center gap-2 font-medium text-ink"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white">{r.icon}</span>{r.label}</span>
                        <span className="font-bold tabular text-ink">{formatINR(r.value)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <Card className="p-4">
                <h3 className="font-display text-base font-bold text-ink">Delivery instructions</h3>
                <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value.slice(0, 200))} placeholder="e.g. Ring the bell twice, leave at hotel reception" className="mt-2" />
                <Input label="Gift message (optional)" wrapperClassName="mt-2" value={giftMessage} onChange={(e) => setGiftMessage(e.target.value.slice(0, 150))} placeholder="e.g. Happy birthday, Asha!" hint="Ordering for someone else? Put their name and number on the address." />
              </Card>

              {suggestions.filter((p) => !items.some((i) => i.product_id === p.id)).length ? (
                <Card className="p-4">
                  <h3 className="font-display text-base font-bold text-ink">You might also like</h3>
                  <div className="scroll-x mt-3 -mx-1 px-1">{suggestions.filter((p) => !items.some((i) => i.product_id === p.id)).slice(0, 8).map((p) => <ProductCard key={p.id} product={p} signedIn={signedIn} showStore={false} className="w-[140px]" />)}</div>
                </Card>
              ) : null}
            </>
          ) : s ? (
            <>
              <Card className="p-4">
                <h3 className="font-display text-base font-bold text-ink">Delivery address</h3>
                <ul className="mt-2 space-y-2">
                  {addresses.map((a) => { const Icon = TYPE_ICON[a.type]; const on = a.id === addressId; return (
                    <li key={a.id}>
                      <button type="button" onClick={() => setAddressId(a.id)} className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left", on ? "border-brand-600 bg-brand-50" : "border-line bg-card")}>
                        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md", on ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-3")}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-ink">{addressTitle(a)} · {a.full_name}</span><span className="block text-xs text-ink-2">{addressLine(a)}</span></span>
                        <Radio on={on} />
                      </button>
                    </li>); })}
                </ul>
                <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => openSheet("address")}><Plus className="h-4 w-4" /> Add new address</Button>
                {addressId && !s.serviceable ? <Alert tone="danger" className="mt-3">{s.service_message ?? "Sorry, Merta Deal is not available in your area yet."}</Alert> : null}
              </Card>

              <Card className="p-4">
                <h3 className="font-display text-base font-bold text-ink">Delivery option</h3>
                {(() => {
                  // Express is offered only where the zone supports it (admins switch it per zone); otherwise it is not shown at all.
                  const opts = ([
                    { id: "express" as const, icon: <Zap className="h-4 w-4 text-saffron-600" aria-hidden />, t: "Express", sub: `+${formatINR(s.express_fee || 20)}`, show: Boolean(s.zone?.express_supported) },
                    { id: "standard" as const, icon: <Clock className="h-4 w-4 text-brand-600" aria-hidden />, t: "As soon as possible", sub: etaText(s.eta_min_minutes, s.eta_max_minutes, "min") ?? "Estimate at checkout", show: true },
                    { id: "scheduled" as const, icon: <CalendarClock className="h-4 w-4 text-info" aria-hidden />, t: "Scheduled", sub: "Pick a slot", show: slots.length > 0 },
                  ]).filter((o) => o.show);
                  return (
                    <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${opts.length}, minmax(0, 1fr))` }}>
                      {opts.map((o) => (
                        <button key={o.id} type="button" aria-pressed={deliveryType === o.id} onClick={() => setDeliveryType(o.id)} className={cn("min-h-11 rounded-xl border p-2.5 text-left", deliveryType === o.id ? "border-brand-600 bg-brand-50" : "border-line bg-card")}>
                          <span className="flex items-center gap-1.5 text-sm font-bold text-ink">{o.icon}{o.t}</span><span className="block text-[11px] text-ink-3">{o.sub}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
                {deliveryType === "scheduled" ? <div className="scroll-x mt-3">{slots.map((x) => <button key={x} type="button" onClick={() => setSlot(x)} className={cn("rounded-full border px-3.5 py-2 text-sm font-medium", slot === x ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-2 bg-card text-ink-2")}>{x.replace("-", " – ")}</button>)}</div> : null}
              </Card>

              <div className="space-y-3">
                <div><p className="mb-1.5 px-1 text-sm font-bold text-ink">Pay by UPI</p><Card><PayRow current={payment} onPick={setPayment} id="upi" icon={<Smartphone className="h-5 w-5" />} title="UPI" sub={razorpayEnabled ? "GPay, PhonePe, Paytm" : "Available once online payments are set up"} disabled={!razorpayEnabled} /></Card></div>
                <div><p className="mb-1.5 px-1 text-sm font-bold text-ink">Credit & Debit Cards</p><Card><PayRow current={payment} onPick={setPayment} id="card" icon={<CreditCard className="h-5 w-5" />} title="Add New Card" sub={razorpayEnabled ? "Visa, Mastercard, RuPay & more" : "Available once online payments are set up"} disabled={!razorpayEnabled} /></Card></div>
                <div><p className="mb-1.5 px-1 text-sm font-bold text-ink">Wallets</p><Card><PayRow current={payment} onPick={setPayment} id="wallet" icon={<Wallet className="h-5 w-5" />} title="Merta Wallet" sub={`Balance ${formatINR(walletBalance)}${walletOk ? "" : " · insufficient for this order"}`} disabled={!walletOk} /></Card></div>
                <div><p className="mb-1.5 px-1 text-sm font-bold text-ink">Netbanking</p><Card><PayRow current={payment} onPick={setPayment} id="netbanking" icon={<Landmark className="h-5 w-5" />} title="Net banking" sub={razorpayEnabled ? "All major banks" : "Available once online payments are set up"} disabled={!razorpayEnabled} /></Card></div>
                {codEnabled ? <div><p className="mb-1.5 px-1 text-sm font-bold text-ink">Cash on Delivery</p><Card><PayRow current={payment} onPick={setPayment} id="cod" icon={<Banknote className="h-5 w-5" />} title="Pay by Cash / UPI on delivery" sub="Pay the rider after OTP handover" /></Card></div> : null}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer CTA */}
        {!empty && s ? (
          <div className="border-t border-line bg-card px-3 pt-3" style={{ paddingBottom: "calc(var(--safe-bottom) + 12px)" }}>
            {step === "cart" ? (
              <>
                {gate.cartBlocker && selectedAddress ? <Alert tone="warning" className="mb-2">{gate.cartBlocker}</Alert> : null}
                {!gate.cartBlocker && selectedAddress && !gate.unserved && items.some((l) => l.price_changed) ? <Alert tone="info" className="mb-2">Some prices changed since you added these items. The bill above uses today&rsquo;s prices.</Alert> : null}
                <Button size="lg" fullWidth className="h-13 rounded-xl text-base" disabled={gate.ctaDisabled} onClick={() => void gate.proceed()}>{gate.ctaLabel}</Button>
                {gate.needsLogin && selectedAddress && !gate.unserved ? <p className="mt-2 text-center text-[11px] text-ink-3">You&rsquo;ll sign in with your mobile number before paying. Your cart and address are kept.</p> : null}
              </>
            ) : (
              <>
                {payBlocker ? <Alert tone="warning" className="mb-2">{payBlocker}</Alert> : null}
                <Button size="lg" fullWidth className="h-13 rounded-xl text-base" loading={placing} disabled={Boolean(payBlocker)} onClick={place}>{ONLINE.includes(payment) ? `Pay ${formatINR(s.total, { precise: true })}` : `Place order · ${formatINR(s.total, { precise: true })}`}</Button>
                <p className="mt-2 text-center text-[11px] text-ink-3">Delivery OTP will be shared after the order is placed.</p>
              </>
            )}
          </div>
        ) : null}
      </aside>
      {sheets}
    </div>,
    document.body,
  );
}
