"use client";
import * as React from "react";
import Link from "next/link";
import { Banknote, Bike, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Clock, Headset, MapPin, MessageSquareText, Phone, Store as StoreIcon, Undo2, UserRound } from "lucide-react";
import type { Enums } from "@/types/database";
import type { PickupPoint, TrackingRider } from "@/types/app";
import type { UpiDetails } from "@/lib/upi";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { UpiQr } from "@/components/shared/upi-qr";
import { Button } from "@/components/ui/button";
import { Avatar, StarRating } from "@/components/ui/misc";
import { cn, formatINR } from "@/lib/utils";

/** One block of the tracking screen: a white rounded card on the page's pale background. */
export const TRACK_CARD = "rounded-xl border border-line bg-card p-4 shadow-card";

type Tone = "brand" | "info" | "saffron" | "warning" | "danger" | "neutral";
const TILE: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700", info: "bg-info-50 text-info", saffron: "bg-saffron-50 text-saffron-700",
  warning: "bg-warning-50 text-warning", danger: "bg-danger-50 text-danger", neutral: "bg-surface-2 text-ink-2",
};

/** The square icon tile every card starts with. Decoration: the words beside it carry the meaning. */
export function IconTile({ tone = "brand", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span aria-hidden className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-md [&>svg]:h-5 [&>svg]:w-5", TILE[tone], className)}>{children}</span>;
}

/** Icon tile · bold title · muted subtitle · an optional control on the right. */
export function CardRow({ icon, lead, tone, title, titleId, as: Title = "p", subtitle, action, children, className }: {
  icon?: React.ReactNode; /** Something other than an icon tile on the left (an avatar). */ lead?: React.ReactNode; tone?: Tone;
  title: React.ReactNode; titleId?: string; as?: "p" | "h2" | "h3"; subtitle?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      {lead ?? <IconTile tone={tone}>{icon}</IconTile>}
      <div className="min-w-0 flex-1 self-center">
        <Title id={titleId} className="font-sans text-[15px] font-bold leading-snug tracking-normal text-ink">{title}</Title>
        {subtitle ? <div className="mt-0.5 text-[13px] leading-snug text-ink-3">{subtitle}</div> : null}
        {children}
      </div>
      {action}
    </div>
  );
}

const CALL = "tap flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

/* ───────────────────────────── Payment ───────────────────────────── */

type PayStatus = Enums<"payment_status">; type PayMethod = Enums<"payment_method">;

/**
 * What the payment card says, read from the order's own total, method and payment status. Nothing is
 * assumed: a status this screen has no sentence for falls back to the method and status labels.
 */
function paymentSummary({ total, method, status, active, stopped, refundDue, upiOnDelivery }: { total: number; method: PayMethod; status: PayStatus; active: boolean; stopped: boolean; refundDue: boolean; upiOnDelivery: boolean }): { tone: Tone; icon: React.ReactNode; title: string; helper: string } {
  const amount = formatINR(total, { precise: true });
  const label = PAYMENT_METHOD_LABEL[method];
  const withRefund = (text: string) => (refundDue ? `${text}. A refund is due and goes back to the original payment method.` : text);
  if (status === "cod_pending") {
    if (stopped) return { tone: "neutral", icon: <Banknote />, title: "Nothing to pay", helper: "This order was to be paid on delivery, and it was not delivered." };
    if (active) return { tone: "brand", icon: <Banknote />, title: `Pay ${amount} on delivery`, helper: upiOnDelivery ? "Cash, or UPI when the rider is with you." : "Keep the cash ready for the rider." };
    return { tone: "neutral", icon: <Banknote />, title: `${amount} · ${PAYMENT_STATUS_LABEL[status]}`, helper: label };
  }
  if (status === "cod_collected") return { tone: "brand", icon: <CheckCircle2 />, title: `Paid ${amount} on delivery`, helper: "Collected by your delivery partner." };
  if (status === "paid") return { tone: "brand", icon: <CheckCircle2 />, title: `Paid ${amount}`, helper: withRefund(label) };
  if (status === "refunded") return { tone: "info", icon: <Undo2 />, title: "Payment refunded", helper: `${label} · order total ${amount}` };
  if (status === "partially_refunded") return { tone: "info", icon: <Undo2 />, title: "Partially refunded", helper: withRefund(`${label} · order total ${amount}`) };
  if (status === "failed") return { tone: "danger", icon: <CircleAlert />, title: "Payment failed", helper: "If money was deducted, it is refunded automatically within 5–7 days." };
  if (status === "pending" && active) return { tone: "warning", icon: <Clock />, title: `Payment of ${amount} pending`, helper: `${label} · packing starts once your payment is received.` };
  return { tone: "neutral", icon: <Banknote />, title: `${amount} · ${PAYMENT_STATUS_LABEL[status]}`, helper: withRefund(label) };
}

/**
 * How this order is paid, in one line. The only action is the one that already exists: for a cash
 * order still unpaid, the shop's UPI QR (when UPI on delivery is switched on) opens under the card.
 * There is no payment gateway behind it — the rider and the shop check the payment, as before.
 */
export function PaymentCard({ total, method, status, active, stopped, refundDue, upi, orderNumber }: {
  total: number; method: PayMethod; status: PayStatus; active: boolean; /** Cancelled or rejected. */ stopped: boolean; refundDue: boolean;
  /** The shop's UPI details; null while loading and whenever UPI on delivery is off. */ upi: UpiDetails | null; orderNumber: string;
}) {
  const [open, setOpen] = React.useState(false);
  const canUpi = Boolean(upi && active && method === "cod" && status === "cod_pending");
  const s = paymentSummary({ total, method, status, active, stopped, refundDue, upiOnDelivery: canUpi });
  return (
    <section className={TRACK_CARD} aria-labelledby="track-pay">
      <CardRow icon={s.icon} tone={s.tone} as="h2" titleId="track-pay" title={s.title} subtitle={s.helper}>
        {canUpi ? (
          <Button variant="secondary" size="sm" className="mt-2.5 rounded-full max-sm:h-11" aria-expanded={open} aria-controls="track-pay-upi" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide UPI details" : "Pay by UPI now"}<ChevronDown className={cn("h-4 w-4 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
          </Button>
        ) : null}
      </CardRow>
      {canUpi && open && upi ? (
        <div id="track-pay-upi" className="mt-3.5 border-t border-line pt-3.5 motion-safe:animate-fade-in">
          <UpiQr upi={upi} amount={total} note={orderNumber} />
          <p className="mt-2 text-center text-xs text-ink-3">Pay now or when the rider is with you, then show the payment success screen and give your delivery OTP.</p>
        </div>
      ) : null}
    </section>
  );
}

/* ───────────────────────────── Delivery partner ───────────────────────────── */

/**
 * Who is bringing the order — or, before anyone is, a plain line saying when someone will be. The
 * phone number is offered only while the rider is actually on the job, and a rider nobody has rated
 * yet shows no stars rather than a row of empty ones.
 */
export function PartnerCard({ rider, doing, callable, packed }: {
  /** Null until a rider has accepted the order. */ rider: TrackingRider | null;
  /** What the rider is doing with this order right now, when the assignment says. */ doing?: string | null;
  callable: boolean; /** The order is packed and waiting for a rider. */ packed?: boolean;
}) {
  if (!rider) {
    return (
      <section className={TRACK_CARD} aria-labelledby="track-partner">
        <CardRow icon={<Bike />} tone="neutral" as="h2" titleId="track-partner" title="Delivery partner"
          subtitle={packed ? "Your order is packed. A delivery partner will be shown here as soon as one accepts it." : "One will be assigned when your order is packed."} />
      </section>
    );
  }
  const name = rider.name?.trim() || null;
  return (
    <section className={TRACK_CARD} aria-labelledby="track-partner">
      <CardRow lead={<Avatar name={rider.name} src={rider.avatar_url} size={44} className="shrink-0" />} as="h2" titleId="track-partner"
        title={name ? <>{name}<span className="font-semibold text-ink-2">, your delivery partner</span></> : "Your delivery partner"}
        subtitle={
          <>
            {doing ? <span className="block">{doing}</span> : null}
            <span className="flex flex-wrap items-center gap-x-2 capitalize">
              <span>{rider.vehicle_type}{rider.vehicle_number ? ` · ${rider.vehicle_number}` : ""}</span>
              {Number(rider.rating_avg) > 0 ? <StarRating value={rider.rating_avg} size={12} /> : null}
            </span>
          </>
        }
        action={rider.phone && callable ? (
          <a href={`tel:${rider.phone}`} aria-label={`Call ${name ?? "your delivery partner"}`} className={cn(CALL, "h-12 w-12 bg-brand-600 text-white shadow-card hover:bg-brand-700")}><Phone className="h-5 w-5" aria-hidden /></a>
        ) : null} />
    </section>
  );
}

/* ───────────────────────────── Delivery details ───────────────────────────── */

/** The number as the customer knows it, with the middle hidden: first two and last three digits. */
function maskPhone(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "").slice(-10);
  if (d.length < 8) return null;
  return { text: `${d.slice(0, 2)}${"•".repeat(d.length - 5)}${d.slice(-3)}`, tail: d.slice(-3) };
}

/** Where it is going and who receives it, exactly as the order's address snapshot holds it. */
export function DeliveryDetailsCard({ addressTitle, lines, receiver, phone, instructions }: {
  addressTitle: string; /** Address lines, already without their empty parts. */ lines: string[];
  receiver?: string | null; phone?: string | null; instructions?: string | null;
}) {
  const masked = maskPhone(phone);
  return (
    <section className={TRACK_CARD} aria-labelledby="track-details">
      <h2 id="track-details" className="font-display text-base font-bold text-ink">Your delivery details</h2>
      <div className="mt-3 space-y-3.5">
        <CardRow icon={<MapPin />} tone="info" title={addressTitle} subtitle={lines.map((l) => <span key={l} className="block break-words">{l}</span>)} />
        {receiver || masked ? (
          <CardRow icon={<UserRound />} tone="neutral" title={receiver || "Receiver"}
            subtitle={masked ? <><span aria-hidden className="tabular tracking-wide">{masked.text}</span><span className="sr-only">Mobile number ending {masked.tail.split("").join(" ")}</span></> : undefined} />
        ) : null}
        {instructions ? <CardRow icon={<MessageSquareText />} tone="saffron" title="Delivery instructions" subtitle={<span className="break-words">“{instructions}”</span>} /> : null}
      </div>
    </section>
  );
}

/* ───────────────────────────── Help ───────────────────────────── */

/** The way to support for this order, and the shop that packs it (with its phone, when it has one). */
export function HelpCard({ orderId, pickup }: { orderId: string; pickup: PickupPoint }) {
  const where = [pickup.address_line1, pickup.area].filter(Boolean).join(", ");
  return (
    <section className={cn(TRACK_CARD, "p-0")} aria-label="Help with this order">
      <Link href={`/account/support?order=${orderId}`} className="tap flex items-center gap-3 rounded-t-xl p-4 transition-colors duration-150 hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600">
        <IconTile tone="brand"><Headset /></IconTile>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-snug text-ink">Need help?</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">Tell us about a problem with this order</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
      </Link>
      <div className="border-t border-line p-4">
        <CardRow icon={<StoreIcon />} tone="neutral" title={<>Packed by {pickup.name}</>} subtitle={where || undefined}
          action={pickup.phone ? <a href={`tel:${pickup.phone}`} aria-label={`Call ${pickup.name}`} className={cn(CALL, "bg-brand-50 text-brand-700 hover:bg-brand-100")}><Phone className="h-5 w-5" aria-hidden /></a> : null} />
      </div>
    </section>
  );
}
