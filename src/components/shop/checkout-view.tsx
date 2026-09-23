"use client";
import * as React from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Home, Briefcase, MapPin, Plus, Zap, Clock, CalendarClock, Banknote, Wallet, Smartphone, CreditCard, Landmark, Check, Info } from "lucide-react";
import type { Address, CartSummary, DeliveryType, PaymentMethod } from "@/types/app";
import { getCartSummary } from "@/lib/actions/cart";
import { placeOrderAction } from "@/lib/actions/checkout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { AddressForm } from "./address-form";
import { PriceBreakdown, FreeDeliveryBar } from "./price-breakdown";
import { cn, formatINR } from "@/lib/utils";

declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void } } }

type Props = { initial: CartSummary; addresses: Address[]; walletBalance: number; razorpayEnabled: boolean; codEnabled: boolean; slots: string[]; user: { name: string | null; phone: string | null } };
const TYPE_ICON = { home: Home, work: Briefcase, other: MapPin };

export function CheckoutView({ initial, addresses: initialAddresses, walletBalance, razorpayEnabled, codEnabled, slots, user }: Props) {
  const router = useRouter();
  const [addresses, setAddresses] = React.useState(initialAddresses);
  const [addressId, setAddressId] = React.useState<string | null>(initialAddresses.find((a) => a.is_default)?.id ?? initialAddresses[0]?.id ?? null);
  const [deliveryType, setDeliveryType] = React.useState<DeliveryType>("standard");
  const [slot, setSlot] = React.useState<string>(slots[0] ?? "");
  const [payment, setPayment] = React.useState<PaymentMethod>(codEnabled ? "cod" : razorpayEnabled ? "upi" : "wallet");
  const [instructions, setInstructions] = React.useState("");
  const [summary, setSummary] = React.useState<CartSummary>(initial);
  const [addOpen, setAddOpen] = React.useState(initialAddresses.length === 0);
  const [placing, setPlacing] = React.useState(false);
  const [refreshing, startRefresh] = React.useTransition();

  React.useEffect(() => {
    startRefresh(async () => { const s = await getCartSummary(addressId, deliveryType); if (s) setSummary(s); });
  }, [addressId, deliveryType]);

  const online = ["upi", "card", "netbanking"] as PaymentMethod[];
  const walletOk = walletBalance >= summary.total;
  const canPlace = addressId && summary.serviceable && summary.meets_min_order && !summary.issues.length && (deliveryType !== "scheduled" || slot) && !(payment === "wallet" && !walletOk) && !(online.includes(payment) && !razorpayEnabled);

  const scheduledRange = () => {
    if (deliveryType !== "scheduled" || !slot) return {};
    const [a, b] = slot.split("-"); const today = new Date(); const mk = (t: string) => { const [h, m] = t.split(":").map(Number); const d = new Date(today); d.setHours(h, m, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d.toISOString(); };
    return { scheduledStart: mk(a), scheduledEnd: mk(b) };
  };

  const place = async () => {
    if (!addressId) return; setPlacing(true);
    const res = await placeOrderAction({ addressId, paymentMethod: payment, deliveryType, instructions, ...scheduledRange() });
    if (!res.ok) { toast.error(res.error); setPlacing(false); return; }
    const order = res.data;
    if (!order.payment_required) { router.replace(`/orders/${order.order_id}?placed=1`); return; }
    // Online payment via Razorpay Checkout
    try {
      const r = await fetch("/api/payments/razorpay/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.order_id }) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Could not start payment"); router.replace(`/orders/${order.order_id}?payment=setup`); return; }
      if (!window.Razorpay) { toast.error("Payment library failed to load. Check your connection."); router.replace(`/orders/${order.order_id}?payment=pending`); return; }
      const rzp = new window.Razorpay({
        key: d.keyId, amount: d.amount, currency: d.currency, name: "Merta Deal", description: `Order ${d.orderNumber}`, order_id: d.razorpayOrderId, prefill: d.prefill, theme: { color: "#0B6E4F" },
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
    <div className="grid gap-5 px-4 sm:px-0 lg:grid-cols-[1fr_360px]">
      {razorpayEnabled ? <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" /> : null}
      <div className="space-y-5">
        <Section step={1} title="Delivery address">
          <ul className="space-y-2">
            {addresses.map((a) => { const Icon = TYPE_ICON[a.type]; const active = a.id === addressId; return (
              <li key={a.id}>
                <button type="button" onClick={() => setAddressId(a.id)} className={cn("flex w-full items-start gap-3 rounded-md border p-3 text-left", active ? "border-brand-600 bg-brand-50" : "border-line bg-card")}>
                  <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm", active ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-3")}>{active ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span>
                  <span className="min-w-0"><span className="block text-sm font-bold text-ink">{a.label ?? a.type[0].toUpperCase() + a.type.slice(1)} · {a.full_name}</span><span className="block text-xs text-ink-2">{a.house}, {a.street}, {a.area}{a.landmark ? `, ${a.landmark}` : ""}, {a.city} – {a.pincode}</span><span className="block text-xs text-ink-3">{a.phone}{a.lat ? " · GPS pinned" : ""}</span></span>
                </button>
              </li>); })}
          </ul>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add new address</Button>
          {addressId && !summary.serviceable ? <Alert tone="danger" className="mt-3">{summary.service_message ?? "Sorry, Merta Deal is not available in your area yet."}</Alert> : null}
        </Section>

        <Section step={2} title="Delivery option">
          <div className="grid gap-2 sm:grid-cols-3">
            <Option active={deliveryType === "express"} disabled={!summary.zone?.express_supported} onClick={() => setDeliveryType("express")} icon={<Zap className="h-5 w-5 text-saffron-600" />} title="Express" subtitle={summary.zone?.express_supported ? `20–35 min · +${formatINR(summary.express_fee || 20)}` : "Not in your zone yet"} />
            <Option active={deliveryType === "standard"} onClick={() => setDeliveryType("standard")} icon={<Clock className="h-5 w-5 text-brand-600" />} title="Standard" subtitle={`${summary.eta_min_minutes}–${summary.eta_max_minutes} min`} />
            <Option active={deliveryType === "scheduled"} onClick={() => setDeliveryType("scheduled")} icon={<CalendarClock className="h-5 w-5 text-info" />} title="Scheduled" subtitle="Pick a slot" />
          </div>
          {deliveryType === "scheduled" ? <div className="scroll-x mt-3">{slots.map((s) => <button key={s} type="button" onClick={() => setSlot(s)} className={cn("rounded-full border px-3.5 py-2 text-sm font-medium", slot === s ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-2 bg-card text-ink-2")}>{s.replace("-", " – ")}</button>)}</div> : null}
          <p className="mt-2 text-xs text-ink-3">ETA is based on the store&apos;s packing time and your zone. We show real estimates, never guarantees.</p>
        </Section>

        <Section step={3} title="Payment">
          <div className="space-y-2">
            {codEnabled ? <PayOption active={payment === "cod"} onClick={() => setPayment("cod")} icon={<Banknote className="h-5 w-5 text-brand-600" />} title="Cash on Delivery" subtitle="Pay the rider after OTP handover" /> : null}
            <PayOption active={payment === "wallet"} disabled={!walletOk} onClick={() => setPayment("wallet")} icon={<Wallet className="h-5 w-5 text-saffron-600" />} title="Merta Wallet" subtitle={`Balance ${formatINR(walletBalance)}${walletOk ? "" : " · insufficient"}`} />
            <PayOption active={payment === "upi"} disabled={!razorpayEnabled} onClick={() => setPayment("upi")} icon={<Smartphone className="h-5 w-5 text-info" />} title="UPI" subtitle="GPay, PhonePe, Paytm via Razorpay" />
            <PayOption active={payment === "card"} disabled={!razorpayEnabled} onClick={() => setPayment("card")} icon={<CreditCard className="h-5 w-5 text-info" />} title="Credit / Debit card" subtitle="Visa, Mastercard, RuPay" />
            <PayOption active={payment === "netbanking"} disabled={!razorpayEnabled} onClick={() => setPayment("netbanking")} icon={<Landmark className="h-5 w-5 text-info" />} title="Net banking" subtitle="All major banks" />
          </div>
          {!razorpayEnabled ? <Alert tone="neutral" icon={<Info className="h-4 w-4" />} className="mt-3">Online payments will be available once Razorpay is configured. Cash on Delivery works today.</Alert> : null}
        </Section>

        <Section step={4} title="Delivery instructions (optional)">
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value.slice(0, 200))} placeholder="e.g. Ring the bell twice, leave with the watchman" />
        </Section>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <FreeDeliveryBar s={summary} />
        <div className={cn("rounded-lg border border-line bg-card p-4", refreshing && "opacity-70")}>
          <h2 className="mb-3 text-base font-bold text-ink">Order summary · {summary.store?.name}</h2>
          <ul className="mb-3 max-h-40 space-y-1 overflow-y-auto text-sm">{summary.items.map((i) => <li key={i.id} className="flex justify-between gap-2"><span className="line-clamp-1 text-ink-2">{i.quantity} × {i.name}</span><span className="tabular text-ink">{formatINR(i.line_total)}</span></li>)}</ul>
          <PriceBreakdown s={summary} />
        </div>
        <Button size="lg" fullWidth loading={placing} disabled={!canPlace} onClick={place}>{online.includes(payment) ? `Pay ${formatINR(summary.total, { precise: true })}` : `Place order · ${formatINR(summary.total, { precise: true })}`}</Button>
        <p className="text-center text-[11px] text-ink-3">By placing this order you agree to the terms of service. Delivery OTP will be shared after the order is placed.</p>
      </aside>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add delivery address" size="lg">
        <AddressForm defaultName={user.name} defaultPhone={user.phone} onCancel={addresses.length ? () => setAddOpen(false) : undefined} onSaved={(a) => { setAddresses((cur) => [a, ...cur.filter((x) => x.id !== a.id)]); setAddressId(a.id); setAddOpen(false); }} />
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
