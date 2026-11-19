"use client";
import * as React from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Home, Briefcase, MapPin, Plus, Zap, Clock, CalendarClock, Banknote, Wallet, Smartphone, CreditCard, Landmark, Check } from "lucide-react";
import type { Address, CartSummary, DeliveryType, PaymentMethod } from "@/types/app";
import { getCartSummary } from "@/lib/actions/cart";
import { placeOrderAction } from "@/lib/actions/checkout";
import { orderNote } from "@/lib/destinations";
import { useUpiDetails } from "@/hooks/use-upi-details";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { AddressWizard } from "./address-wizard";
import { PriceBreakdown, FreeDeliveryBar } from "./price-breakdown";
import { PlaceOrderSheet } from "./place-order-flow";
import { ScheduleSheet } from "./schedule-sheet";
import { useCheckoutStore } from "@/stores/checkout-store";
import { parseSlotKey, slotSummary, slotWindow } from "@/lib/slots";
import { cn, formatINR } from "@/lib/utils";
import { hasCake } from "@/lib/cake";

declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void } } }

type Props = { initial: CartSummary; addresses: Address[]; walletBalance: number; razorpayEnabled: boolean; codEnabled: boolean; slots: string[]; slotRules: { leadMinutes: number; daysAhead: number }; user: { name: string | null; phone: string | null }; /** false while the shop is at its active-order limit */ accepting?: boolean };
const TYPE_ICON = { home: Home, work: Briefcase, other: MapPin };

export function CheckoutView({ initial, addresses: initialAddresses, walletBalance, razorpayEnabled, codEnabled, slots, slotRules, user, accepting = true }: Props) {
  const router = useRouter();
  const [addresses, setAddresses] = React.useState(initialAddresses);
  const [addressId, setAddressId] = React.useState<string | null>(initialAddresses.find((a) => a.is_default)?.id ?? initialAddresses[0]?.id ?? null);
  const [deliveryType, setDeliveryType] = React.useState<DeliveryType>("standard");
  const slotKey = useCheckoutStore((st) => st.slotKey);
  const setSlotKey = useCheckoutStore((st) => st.setSlotKey);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  // "Now" is read once per mount (a render must stay pure); the sheet itself recomputes slots when it opens.
  const [now] = React.useState(() => Date.now());
  const slotParsed = parseSlotKey(slotKey);
  const chosenSlot = slotParsed && slotWindow(slotParsed.date, slotParsed.range).start.getTime() > now ? slotKey : null;
  const instantOk = initial.business_open !== false;
  // Scheduling is switched on by the `scheduled_slots` setting. With no slots there is nothing to
  // offer and nothing to tell a closed-shop customer to do, so neither the tile nor the advice shows.
  const canSchedule = slots.length > 0;
  const [payment, setPayment] = React.useState<PaymentMethod>(codEnabled ? "cod" : razorpayEnabled ? "upi" : "wallet");
  const [instructions, setInstructions] = React.useState("");
  const [gift, setGift] = React.useState("");
  const upi = useUpiDetails();
  const [summary, setSummary] = React.useState<CartSummary>(initial);
  // Express can only stay selected while the delivery zone offers it.
  if (deliveryType === "express" && summary && !summary.zone?.express_supported) setDeliveryType("standard");
  const [addOpen, setAddOpen] = React.useState(initialAddresses.length === 0);
  // Which step of the new-address wizard the screen header is showing (see AddressWizard).
  const [mapStep, setMapStep] = React.useState(false);
  const [wasAddOpen, setWasAddOpen] = React.useState(addOpen);
  if (wasAddOpen !== addOpen) { setWasAddOpen(addOpen); if (!addOpen) setMapStep(false); }
  const [placing, setPlacing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [refreshing, startRefresh] = React.useTransition();

  React.useEffect(() => {
    startRefresh(async () => { const s = await getCartSummary(addressId, deliveryType); if (s) setSummary(s); });
  }, [addressId, deliveryType]);

  const online = ["upi", "card", "netbanking"] as PaymentMethod[];
  const walletOk = walletBalance >= summary.total;
  // The wallet is offered only to someone who has money in it; nobody is shown a ₹0 option they cannot use.
  const showWallet = walletBalance > 0;
  // A gift message is asked for only when the order has a cake in it.
  const cakeInCart = hasCake(summary.items);
  // The first reason the order cannot be placed, in the order a customer can fix it. Shown next
  // to the button so a greyed-out "Place order" is never a mystery. The rules themselves come from
  // cart_summary (zone min order, serviceability), not from here.
  const blocker = !accepting ? "We're handling as many orders as we can right now. Please try again in a few minutes."
    : !addressId ? "Select or add a delivery address to continue."
    : !summary.serviceable ? (summary.service_message ?? "We don't deliver to this address yet.")
    : !summary.meets_min_order ? `Minimum order is ${formatINR(summary.min_order_amount)} for your area. Add ${formatINR(summary.min_order_amount - summary.subtotal)} more to place this order.`
    : summary.issues.length ? "Some items are no longer available in the quantity you chose. Update your cart to continue."
    : deliveryType === "scheduled" && !chosenSlot ? "Pick a delivery slot to continue."
    : deliveryType !== "scheduled" && !instantOk ? (canSchedule ? "We're closed right now. Schedule your order for a slot instead." : "We're closed right now. Please place your order once we reopen.")
    : payment === "wallet" && !walletOk ? "Your wallet balance doesn't cover this order. Choose another payment method."
    : online.includes(payment) && !razorpayEnabled && !(payment === "upi" && upi?.payNow) ? "Online payment isn't available yet. Choose Cash on Delivery."
    : null;
  const canPlace = !blocker;

  const scheduledRange = () => {
    const p = parseSlotKey(chosenSlot);
    if (deliveryType !== "scheduled" || !p) return {};
    const w = slotWindow(p.date, p.range);
    return { scheduledStart: w.start.toISOString(), scheduledEnd: w.end.toISOString() };
  };

  const place = async () => {
    if (!addressId || placing) return; setConfirming(false); setPlacing(true);
    const res = await placeOrderAction({ addressId, paymentMethod: payment, deliveryType, instructions: orderNote(instructions, cakeInCart ? gift : ""), ...scheduledRange() });
    if (!res.ok) {
      toast.error(res.error); setPlacing(false);
      // The address list on screen can belong to an earlier (guest) session; reload it so the customer picks a current one.
      if (/delivery address/i.test(res.error)) { setAddressId(null); router.refresh(); }
      return;
    }
    const order = res.data;
    if (!order.payment_required) { router.replace(`/orders/${order.order_id}?placed=1`); return; }
    // Online payment via Razorpay Checkout
    try {
      const r = await fetch("/api/payments/razorpay/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.order_id }) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Could not start payment"); router.replace(`/orders/${order.order_id}?payment=setup`); return; }
      if (!window.Razorpay) { toast.error("Payment library failed to load. Check your connection."); router.replace(`/orders/${order.order_id}?payment=pending`); return; }
      const rzp = new window.Razorpay({
        key: d.keyId, amount: d.amount, currency: d.currency, name: "Merta Deal", description: `Order ${d.orderNumber}`, order_id: d.razorpayOrderId, prefill: d.prefill, theme: { color: "#329537" },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const v = await fetch("/api/payments/razorpay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.order_id, ...resp }) });
          if (v.ok) router.replace(`/orders/${order.order_id}?placed=1`); else { const e = await v.json(); toast.error(e.error ?? "Payment verification failed"); router.replace(`/orders/${order.order_id}?payment=failed`); }
        },
        modal: { ondismiss: () => { toast.warning("Payment not completed", "Your order is saved; you can retry payment from the order page."); router.replace(`/orders/${order.order_id}?payment=pending`); } },
      });
      rzp.open();
    } catch { toast.error("Could not start payment"); router.replace(`/orders/${order.order_id}?payment=pending`); }
    setPlacing(false);
  };

  return (
    <div className="grid grid-cols-1 gap-5 px-4 sm:px-0 lg:grid-cols-[minmax(0,1fr)_360px]">
      {razorpayEnabled ? <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" /> : null}
      <div className="space-y-5">
        <Section step={1} title="Delivery address">
          <ul className="space-y-2">
            {addresses.map((a) => { const Icon = TYPE_ICON[a.type]; const active = a.id === addressId; return (
              <li key={a.id}>
                <button type="button" onClick={() => setAddressId(a.id)} className={cn("flex w-full items-start gap-3 rounded-md border p-3 text-left", active ? "border-brand-600 bg-brand-50" : "border-line bg-card")}>
                  <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm", active ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-3")}>{active ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span>
                  <span className="min-w-0"><span className="block text-sm font-bold text-ink">{a.label ?? a.type[0].toUpperCase() + a.type.slice(1)} · {a.full_name}</span><span className="block text-xs text-ink-2">{[a.house, a.street, a.area, a.landmark, `${a.city} – ${a.pincode}`].filter(Boolean).join(", ")}</span><span className="block text-xs text-ink-3">{a.phone}{a.lat ? " · GPS pinned" : ""}</span></span>
                </button>
              </li>); })}
          </ul>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add new address</Button>
          {addressId && !summary.serviceable ? <Alert tone="danger" className="mt-3">{summary.service_message ?? "Sorry, Merta Deal is not available in your area yet."}</Alert> : null}
        </Section>

        <Section step={2} title="Delivery option">
          <div className={cn("grid gap-2", [summary.zone?.express_supported, canSchedule].filter(Boolean).length === 2 ? "sm:grid-cols-3" : summary.zone?.express_supported || canSchedule ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
            {summary.zone?.express_supported ? <Option active={deliveryType === "express"} disabled={!summary.zone?.express_supported} onClick={() => setDeliveryType("express")} icon={<Zap className="h-5 w-5 text-saffron-600" />} title="Express" subtitle={summary.zone?.express_supported ? `20–35 min · +${formatINR(summary.express_fee || 20)}` : "Not in your zone yet"} /> : null}
            <Option active={deliveryType === "standard"} disabled={!instantOk} onClick={() => setDeliveryType("standard")} icon={<Clock className="h-5 w-5 text-brand-600" />} title="Instant Delivery" subtitle={instantOk ? `${summary.eta_min_minutes}–${summary.eta_max_minutes} min` : "Unavailable now"} />
            {canSchedule ? <Option active={deliveryType === "scheduled"} onClick={() => setScheduleOpen(true)} icon={<CalendarClock className="h-5 w-5 text-info" />} title="Scheduled" subtitle={chosenSlot && deliveryType === "scheduled" ? slotSummary(chosenSlot)! : "Pick a slot"} /> : null}
          </div>
          {deliveryType === "scheduled" ? <div className="mt-3 flex items-center justify-between rounded-md bg-surface-2 px-3 py-2.5 text-sm"><span className="font-medium text-ink">{chosenSlot ? slotSummary(chosenSlot) : "No slot picked yet"}</span><button type="button" onClick={() => setScheduleOpen(true)} className="font-bold text-brand-700">{chosenSlot ? "Change" : "Pick a slot"}</button></div> : null}
          <p className="mt-2 text-xs text-ink-3">ETA is based on packing time and your zone. We show real estimates, never guarantees.</p>
        </Section>

        <Section step={3} title="Payment">
          <div className="space-y-2">
            {codEnabled ? <PayOption active={payment === "cod"} onClick={() => setPayment("cod")} icon={<Banknote className="h-5 w-5 text-brand-600" />} title={upi ? "Cash or UPI on delivery" : "Cash on delivery"} subtitle={upi ? "Pay cash or by PhonePe, Google Pay or Paytm when your order arrives" : "Pay the rider when your order arrives"} /> : null}
            {showWallet ? <PayOption active={payment === "wallet"} disabled={!walletOk} onClick={() => setPayment("wallet")} icon={<Wallet className="h-5 w-5 text-saffron-600" />} title="Merta Wallet" subtitle={`Balance ${formatINR(walletBalance)}${walletOk ? "" : " · insufficient"}`} /> : null}
            {razorpayEnabled || upi?.payNow ? <PayOption active={payment === "upi"} onClick={() => setPayment("upi")} icon={<Smartphone className="h-5 w-5 text-info" />} title="UPI · PhonePe, Google Pay, Paytm" subtitle={razorpayEnabled ? "Pay securely in the next step" : "Pay right after ordering; we pack once your payment is confirmed"} /> : null}
            {razorpayEnabled ? <PayOption active={payment === "card"} disabled={!razorpayEnabled} onClick={() => setPayment("card")} icon={<CreditCard className="h-5 w-5 text-info" />} title="Credit / Debit card" subtitle="Visa, Mastercard, RuPay" /> : null}
            {razorpayEnabled ? <PayOption active={payment === "netbanking"} disabled={!razorpayEnabled} onClick={() => setPayment("netbanking")} icon={<Landmark className="h-5 w-5 text-info" />} title="Net banking" subtitle="All major banks" /> : null}
          </div>
        </Section>

        <Section step={4} title="Delivery instructions (optional)">
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value.slice(0, 200))} placeholder="e.g. Ring the bell twice, leave at hotel reception" />
          {cakeInCart ? <Input label="Gift message (optional)" wrapperClassName="mt-2" value={gift} onChange={(e) => setGift(e.target.value.slice(0, 150))} placeholder="e.g. Happy birthday, Asha!" hint="Ordering for someone else? Put their name and number on the address." /> : null}
        </Section>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <FreeDeliveryBar s={summary} />
        <div className={cn("rounded-lg border border-line bg-card p-4", refreshing && "opacity-70")}>
          <h2 className="mb-3 text-base font-bold text-ink">Order summary</h2>
          <ul className="mb-3 max-h-40 space-y-1 overflow-y-auto text-sm">{summary.items.map((i) => <li key={i.id} className="flex justify-between gap-2"><span className="line-clamp-1 text-ink-2">{i.quantity} × {i.name}</span><span className="tabular text-ink">{formatINR(i.line_total)}</span></li>)}</ul>
          <PriceBreakdown s={summary} />
        </div>
        {blocker ? <Alert tone="warning">{blocker}{!summary.meets_min_order && addressId && summary.serviceable ? <> <Link href="/cart" className="font-semibold underline">Add items</Link></> : null}</Alert> : null}
        <Button size="lg" fullWidth loading={placing} disabled={!canPlace} onClick={() => setConfirming(true)}>{online.includes(payment) && razorpayEnabled ? `Pay ${formatINR(summary.total, { precise: true })}` : `Place order · ${formatINR(summary.total, { precise: true })}`}</Button>
        <p className="text-center text-[11px] text-ink-3">By placing this order you agree to the terms of service. Delivery OTP will be shared after the order is placed.</p>
      </aside>

      {scheduleOpen ? (
        <ScheduleSheet onClose={() => setScheduleOpen(false)} ranges={slots} leadMinutes={slotRules.leadMinutes} daysAhead={slotRules.daysAhead} instantAvailable={instantOk} etaLabel={`${summary.eta_min_minutes}–${summary.eta_max_minutes} min`} itemCount={summary.item_count}
          current={chosenSlot && deliveryType === "scheduled" ? { type: "scheduled", key: chosenSlot } : { type: "standard" }}
          onConfirm={(c) => { if (c.type === "scheduled") { setSlotKey(c.key); setDeliveryType("scheduled"); } else if (deliveryType === "scheduled") setDeliveryType("standard"); setScheduleOpen(false); }} />
      ) : null}
      <PlaceOrderSheet open={confirming} onClose={() => setConfirming(false)} onPlace={() => void place()} address={addresses.find((a) => a.id === addressId) ?? null} total={summary.total} payment={payment} upi={Boolean(upi)} upiNow={Boolean(upi?.payNow) && !razorpayEnabled} />
      <Modal open={addOpen} onClose={() => (mapStep ? setMapStep(false) : setAddOpen(false))} title={mapStep ? "Select Your Location" : "Location information"} size="screen">
        <AddressWizard mapOpen={mapStep} onMapOpenChange={setMapStep} defaultName={user.name} defaultPhone={user.phone} onCancel={addresses.length ? () => setAddOpen(false) : undefined} onSaved={(a) => { setAddresses((cur) => [a, ...cur.filter((x) => x.id !== a.id)]); setAddressId(a.id); setAddOpen(false); }} />
      </Modal>
    </div>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-line bg-card p-4"><h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">{step}</span>{title}</h2>{children}</section>;
}
function Option({ active, disabled, onClick, icon, title, subtitle }: { active: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={cn("flex items-center gap-3 rounded-md border p-3 text-left disabled:opacity-50", active ? "border-brand-600 bg-brand-50" : "border-line bg-card")}>{icon}<span><span className="block text-sm font-bold text-ink">{title}</span><span className="block text-xs text-ink-3">{subtitle}</span></span></button>;
}
function PayOption(props: { active: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string }) {
  return <Option {...props} />;
}
