import { Phone, Wifi, WifiOff } from "lucide-react";
import type { OrderStatus } from "@/lib/order-status";
import type { TrackingRider } from "@/types/app";
import { CUSTOMER_STEPS } from "@/components/shop/order-status";
import { OrderStatusArt } from "@/components/shop/order-status-art";
import { Avatar, StarRating } from "@/components/ui/misc";
import { cn, formatTime } from "@/lib/utils";

/**
 * The top of the tracking screen: what is happening to the order, in the largest type on the page, with
 * when it should arrive and whether this screen is still receiving updates. The four-step bar is the
 * same placed → packing → on the way → delivered the timeline below spells out with times.
 *
 * "Live" is only ever the Realtime connection's own answer. When it drops the pill says so and the
 * line under it gives the time of the last update we actually received.
 */
export function StatusHero({ status, title, detail, orderNumber, active, connected, offline, syncedAt }: {
  status: OrderStatus; title: string; detail: React.ReactNode; orderNumber: string;
  /** False once the order is delivered, cancelled or rejected: nothing more will arrive. */ active: boolean;
  connected: boolean; offline: boolean; syncedAt: number | null;
}) {
  const stopped = status === "cancelled" || status === "rejected";
  const current = CUSTOMER_STEPS.findIndex((s) => s.statuses.includes(status));
  return (
    <section className={cn("relative isolate overflow-hidden rounded-3xl p-5 text-white shadow-card sm:p-6", stopped ? "bg-ink" : "bg-brand-700")}>
      <span aria-hidden className="pointer-events-none absolute -right-14 -top-20 -z-10 h-56 w-56 rounded-full bg-white/[0.07]" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 right-10 -z-10 h-48 w-48 rounded-full bg-white/[0.05]" />

      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-xs font-semibold text-white/80">Order {orderNumber}</p>
        {active ? (
          <span role="status" aria-live="polite" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold">
            {connected
              ? <><span aria-hidden className="h-2 w-2 rounded-full bg-brand-300 motion-safe:animate-pulse-soft" />Live updates</>
              : <>{offline ? <WifiOff className="h-3 w-3" aria-hidden /> : <Wifi className="h-3 w-3 opacity-70" aria-hidden />}{offline ? "No internet" : "Reconnecting…"}</>}
          </span>
        ) : null}
      </div>

      <div className="mt-3.5 flex items-center gap-3.5">
        <OrderStatusArt key={status} status={status} className="h-[68px] w-[68px]" />
        {/* Status changes arrive over Realtime; the new headline is announced to screen readers. */}
        <div aria-live="polite" aria-atomic="true" className="min-w-0">
          <h1 className="font-display text-[26px] font-extrabold leading-[1.1] tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm leading-snug text-white/85">{detail}</p>
        </div>
      </div>

      {!stopped && current >= 0 ? (
        <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Order progress">
          {CUSTOMER_STEPS.map((s, i) => {
            const done = i < current || (i === current && s.key === "delivered"); const now = i === current && !done;
            return (
              <li key={s.key} aria-current={i === current ? "step" : undefined} className="min-w-0">
                <span aria-hidden className={cn("block h-1.5 rounded-full", done ? "bg-white" : now ? "bg-white motion-safe:animate-pulse-soft" : "bg-white/25")} />
                <span className={cn("mt-1.5 block truncate text-[11px] leading-tight", i <= current ? "font-bold text-white" : "font-medium text-white/65")}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {active && !connected && syncedAt ? <p className="mt-3 text-xs text-white/75">Showing the last update we received, at {formatTime(new Date(syncedAt))}.</p> : null}
    </section>
  );
}

/** Who is bringing the order. The phone number is offered only while they are actually on the job. */
export function RiderCard({ rider, callable, pickedUp }: { rider: TrackingRider; callable: boolean; pickedUp: boolean }) {
  const name = rider.name ?? "Delivery partner";
  return (
    <section aria-label="Your delivery partner" className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3.5 shadow-card">
      <Avatar name={rider.name} src={rider.avatar_url} size={48} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{pickedUp ? "Bringing your order" : "Your delivery partner"}</p>
        <p className="truncate text-[15px] font-bold leading-tight text-ink">{name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs capitalize text-ink-3">
          <span>{rider.vehicle_type}{rider.vehicle_number ? ` · ${rider.vehicle_number}` : ""}</span>
          {/* A rider nobody has rated yet shows no stars rather than a row of empty ones. */}
          {Number(rider.rating_avg) > 0 ? <StarRating value={rider.rating_avg} size={12} /> : null}
        </p>
      </div>
      {rider.phone && callable ? (
        <a href={`tel:${rider.phone}`} aria-label={`Call ${name}`}
          className="tap flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-card transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
          <Phone className="h-5 w-5" aria-hidden />
        </a>
      ) : null}
    </section>
  );
}
