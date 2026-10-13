"use client";
import { usePathname } from "next/navigation";
import { ShoppingBag, ChevronRight } from "lucide-react";
import { useCartStore } from "@/stores/cart-store";
import { formatINR } from "@/lib/utils";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";

/** Floating cart summary shown above the bottom nav when the cart has items (hidden on cart/checkout/orders and the product page, which has its own bar). */
export function StickyCartBar() {
  const pathname = usePathname();
  const summary = useCartStore((s) => s.summary);
  const count = useCartStore((s) => s.totalCount());
  const openDrawer = useCartStore((s) => s.openDrawer);
  const drawer = useCartStore((s) => s.drawer);
  const keyboard = useKeyboardOpen();
  if (keyboard || drawer || !summary || count === 0 || pathname.startsWith("/cart") || pathname.startsWith("/checkout") || pathname.startsWith("/orders") || pathname.startsWith("/p/")) return null;
  return (
    <>
    {/* Takes the bar's height in the page flow so the bar never covers the last row of content. */}
    <div aria-hidden className="md:hidden" style={{ height: "calc(var(--cart-bar-h) + 8px)" }} />
    <div className="fixed inset-x-0 z-40 px-3 md:hidden" style={{ bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 6px)" }}>
      <button type="button" onClick={() => openDrawer("cart")} aria-label={`View cart: ${count} item${count > 1 ? "s" : ""}, ${formatINR(summary.subtotal)}`}
        className="mx-auto flex w-full max-w-xl items-center justify-between rounded-xl bg-brand-700 px-3 text-white shadow-[0_4px_14px_-6px_rgb(20_83_45/0.6)] motion-safe:animate-slide-up focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800" style={{ height: "var(--cart-bar-h)" }}>
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15"><ShoppingBag className="h-4 w-4" aria-hidden /></span>
          <span className="min-w-0 leading-tight"><span className="block truncate text-sm font-bold">{count} item{count > 1 ? "s" : ""} · {formatINR(summary.subtotal)}</span><span className="block truncate text-[11px] text-white/85">Delivery in {summary.eta_min_minutes}–{summary.eta_max_minutes} min</span></span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-bold">View cart <ChevronRight className="h-4 w-4" aria-hidden /></span>
      </button>
    </div>
    </>
  );
}
