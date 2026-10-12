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
    <div aria-hidden className="h-[76px] md:hidden" />
    <div className="fixed inset-x-3 z-40 md:hidden" style={{ bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 18px)" }}>
      <button type="button" onClick={() => openDrawer("cart")} className="flex w-full items-center justify-between rounded-[20px] bg-gradient-to-r from-brand-800 to-brand-600 px-4 py-3 text-white shadow-float animate-slide-up">
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/15"><ShoppingBag className="h-5 w-5" /></span>
          <span className="leading-tight"><span className="block text-sm font-bold">{count} item{count > 1 ? "s" : ""} · {formatINR(summary.subtotal)}</span><span className="block text-[11px] text-white/80">Delivering in {summary.eta_min_minutes}–{summary.eta_max_minutes} min</span></span>
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-bold">View cart <ChevronRight className="h-4 w-4" /></span>
      </button>
    </div>
    </>
  );
}
