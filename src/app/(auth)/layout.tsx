import type { Metadata } from "next";
import { Apple, Carrot, Wheat, ShoppingBasket, Zap, Banknote, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/misc";
import { site } from "@/config/site";

/** Produce icons drifting in the hero; purely decorative, still when reduced motion is preferred. */
const FLOATERS = [
  { Icon: Apple, cls: "right-1 top-1 h-11 w-11 text-saffron-300", delay: "0s", tilt: "-8deg" },
  { Icon: Carrot, cls: "right-16 top-9 h-7 w-7 text-saffron-400/70", delay: "1.2s", tilt: "18deg" },
  { Icon: Wheat, cls: "right-28 -top-1 h-8 w-8 text-white/30", delay: "0.6s", tilt: "-14deg" },
  { Icon: ShoppingBasket, cls: "right-40 top-7 hidden h-7 w-7 text-white/20 sm:block", delay: "2s", tilt: "6deg" },
];
const PERKS = [
  { Icon: Zap, t: site.deliveryWindowShort, s: "delivery" },
  { Icon: Banknote, t: "Pay on", s: "delivery" },
  { Icon: ShieldCheck, t: "OTP", s: "safe handover" },
];

/** Sign-in pages carry no search value. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-6 pb-20 pt-8 text-white">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-saffron-400/20 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute inset-x-6 top-7 mx-auto h-16 max-w-md">
          {FLOATERS.map(({ Icon, cls, delay, tilt }, i) => (
            <Icon key={i} className={`absolute motion-safe:animate-float ${cls}`} strokeWidth={1.5} style={{ animationDelay: delay, ["--tilt" as string]: tilt, transform: `rotate(${tilt})` }} />
          ))}
        </div>
        <div className="relative mx-auto max-w-md motion-safe:animate-rise">
          <Logo light size="lg" />
          <p className="mt-3 font-display text-2xl font-extrabold leading-tight">{site.tagline}</p>
          <p className="mt-1 max-w-[18rem] text-sm text-white/80">Groceries, fruits and vegetables from Merta Deal, delivered in {site.deliveryWindow}.</p>
          <ul className="mt-5 flex gap-2">
            {PERKS.map(({ Icon, t, s }, i) => (
              <li key={t} className="flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs backdrop-blur motion-safe:animate-rise" style={{ animationDelay: `${150 + i * 90}ms` }}>
                <Icon className="h-3.5 w-3.5 text-saffron-300" /><span><b>{t}</b> {s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto -mt-12 w-full max-w-md flex-1 px-4 pb-10">
        <div className="rounded-2xl border border-line bg-card p-5 shadow-float motion-safe:animate-rise sm:p-6" style={{ animationDelay: "120ms" }}>{children}</div>
      </div>
    </div>
  );
}
