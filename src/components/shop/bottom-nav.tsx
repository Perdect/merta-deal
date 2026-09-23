"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { customerNav } from "@/config/site";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { useCartStore } from "@/stores/cart-store";
import { cn } from "@/lib/utils";

/** Floating glass dock (mobile only). */
export function BottomNav() {
  const pathname = usePathname();
  const count = useCartStore((s) => s.totalCount());
  return (
    <nav className="fixed inset-x-3 z-40 md:hidden" style={{ bottom: "calc(var(--safe-bottom) + 10px)" }} aria-label="Primary">
      <ul className="grid grid-cols-5 rounded-[26px] border border-white/60 bg-card/85 shadow-float backdrop-blur-2xl" style={{ height: "var(--bottom-nav-h)" }}>
        {customerNav.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("relative flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold transition-colors", active ? "text-brand-700" : "text-ink-3")}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-all", active && "bg-brand-600 text-white shadow-[0_4px_12px_-4px_rgb(11_110_79/0.6)]")}>
                  <DynamicIcon name={item.icon} className="h-[18px] w-[18px]" />
                </span>
                {item.label}
                {item.icon === "cart" && count > 0 ? <span className="absolute right-[16%] top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-saffron-500 px-1 text-[10px] font-bold text-ink animate-pop">{count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
