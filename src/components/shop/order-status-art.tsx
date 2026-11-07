import type { OrderStatus } from "@/lib/order-status";
import { cn } from "@/lib/utils";

const box = "[transform-box:fill-box] [transform-origin:center]";
const svgProps = { viewBox: "0 0 64 64", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

/**
 * A small moving picture for the order's current stage on the tracking page: the bag being packed,
 * the packed box, the rider on the road, the tick. Transform and opacity only, loops with pauses,
 * and still under prefers-reduced-motion (motion-safe:). Pure decoration; the text carries the status.
 */
export function OrderStatusArt({ status, className }: { status: OrderStatus; className?: string }) {
  const cls = cn("h-16 w-16 shrink-0 overflow-visible", className);
  switch (status) {
    case "placed": return (
      <svg {...svgProps} className={cn(cls, "text-info")}>
        <circle cx="32" cy="32" r="30" fill="var(--color-brand-50)" stroke="none" />
        <path d="M20 14h24v34l-4-3-4 3-4-3-4 3-4-3-4 3z" fill="var(--color-card)" />
        <path d="M26 23h12M26 30h12M26 37h7" strokeWidth={2} />
        <circle cx="46" cy="44" r="9" fill="var(--color-card)" />
        <g className="motion-safe:animate-[ord-clock_4s_linear_infinite]" style={{ transformBox: "view-box", transformOrigin: "46px 44px" }}><path d="M46 44V38" strokeWidth={2.2} /></g>
        <circle cx="46" cy="44" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    );
    case "confirmed": case "preparing": return (
      <svg {...svgProps} className={cn(cls, "text-brand-700")}>
        <circle cx="32" cy="32" r="30" fill="var(--color-brand-50)" stroke="none" />
        {/* groceries drop into the bag one after another; the bag's fill hides them as they land */}
        <circle cx="25" cy="18" r="3.2" fill="var(--color-saffron-500)" stroke="none" className="motion-safe:animate-[ord-drop_3s_ease-in-out_infinite]" />
        <rect x="29.5" y="12" width="5" height="7" rx="1.2" fill="var(--color-brand-600)" stroke="none" className="motion-safe:animate-[ord-drop_3s_ease-in-out_0.6s_infinite]" />
        <circle cx="39" cy="18" r="3.2" fill="var(--color-danger)" stroke="none" className="motion-safe:animate-[ord-drop_3s_ease-in-out_1.2s_infinite]" />
        <path d="M20 28h24l-2.2 22H22.2z" fill="var(--color-card)" />
        <path d="M26 28v-3.5a6 6 0 0 1 12 0V28" strokeWidth={2} />
      </svg>
    );
    case "ready_for_pickup": return (
      <svg {...svgProps} className={cn(cls, "text-saffron-600")}>
        <circle cx="32" cy="32" r="30" fill="var(--color-brand-50)" stroke="none" />
        <path d="M18 26l14-7 14 7v18l-14 7-14-7z" fill="var(--color-card)" />
        <path d="M18 26l14 7 14-7M32 33v18" />
        <circle cx="46" cy="20" r="8" fill="var(--color-success)" stroke="none" opacity={0} className={`${box} motion-safe:animate-[svc-ring_3s_ease-out_infinite]`} />
        <circle cx="46" cy="20" r="8" fill="var(--color-success)" stroke="none" />
        <path d="M42 20l3 3 5-6" stroke="#fff" strokeWidth={2.2} />
      </svg>
    );
    case "rider_assigned": case "out_for_delivery": {
      const moving = status === "out_for_delivery";
      return (
        <svg {...svgProps} className={cn(cls, "text-brand-700")}>
          <circle cx="32" cy="32" r="30" fill="var(--color-brand-50)" stroke="none" />
          {moving ? <g strokeWidth={2} strokeDasharray="4 6" className="motion-safe:animate-[svc-road_0.9s_linear_infinite]"><path d="M2 30h10" /><path d="M-2 37h12" /><path d="M4 44h7" /></g> : null}
          <path d="M10 52h44" strokeWidth={2} opacity={0.5} />
          <g className={`${box} ${moving ? "motion-safe:animate-[svc-bob_1.1s_ease-in-out_infinite]" : ""}`}>
            <rect x="14" y="30" width="11" height="9" rx="1.5" fill="var(--color-saffron-500)" stroke="none" />
            <path d="M25 44l5-12h8l5 7h5" />
            <circle cx="22" cy="46" r="5" fill="var(--color-card)" />
            <circle cx="46" cy="46" r="5" fill="var(--color-card)" />
            <path d="M33 32l3-7h6" />
            <circle cx="40" cy="18" r="4" fill="var(--color-card)" />
            <path d="M36 25l4-2 4 5" strokeWidth={2} />
          </g>
          {!moving ? <circle cx="50" cy="20" r="3" fill="var(--color-success)" stroke="none" className="motion-safe:animate-[ord-glow_1.6s_ease-in-out_infinite]" /> : null}
        </svg>
      );
    }
    case "delivered": case "completed": return (
      <svg {...svgProps} className={cn(cls, "text-success")}>
        <circle cx="32" cy="32" r="30" fill="var(--color-brand-50)" stroke="none" />
        <circle cx="32" cy="32" r="18" fill="var(--color-success)" stroke="none" opacity={0} className={`${box} motion-safe:animate-tick-ring`} />
        <circle cx="32" cy="32" r="18" fill="var(--color-success)" stroke="none" className={`${box} motion-safe:animate-tick-pop`} />
        <path d="M23 33l6 6 12-13" stroke="#fff" strokeWidth={3} pathLength={1} className="motion-safe:animate-tick-draw" style={{ strokeDasharray: 1, strokeDashoffset: 1 }} />
      </svg>
    );
    default: return (
      <svg {...svgProps} className={cn(cls, "text-danger")}>
        <circle cx="32" cy="32" r="30" fill="var(--color-danger-50)" stroke="none" />
        <circle cx="32" cy="32" r="18" fill="var(--color-card)" />
        <path d="M25 25l14 14M39 25L25 39" strokeWidth={3} />
      </svg>
    );
  }
}
