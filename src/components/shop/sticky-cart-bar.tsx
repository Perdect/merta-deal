"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, ChevronRight } from "lucide-react";
import { useCartStore } from "@/stores/cart-store";
import { formatINR } from "@/lib/utils";

/** Floating cart summary shown above the bottom nav when the cart has items (hidden on cart/checkout). */
export function StickyCartBar() {
  const pathname = usePathname();
  const summary = useCartStore((s) => s.summary);
  const count = useCartStore((s) => s.totalCount());
  if (!summary || count === 0 || pathname.startsWith("/cart") || pathname.startsWith("/checkout") || pathname.startsWith("/orders")) return null;
  return (
    <div className="fixed inset-x-3 z-40 md:hidden" style={{ bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 18px)" }}>
      <Link href="/cart" className="flex items-center justify-between rounded-[20px] bg-gradient-to-r from-brand-800 to-brand-600 px-4 py-3 text-white shadow-float animate-slide-up">
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/15"><ShoppingBag className="h-5 w-5" /></span>
          <span className="leading-tight"><span className="block text-sm font-bold">{count} item{count > 1 ? "s" : ""} · {formatINR(summary.subtotal)}</span><span className="block text-[11px] text-white/80">{summary.store?.name ?? "Your cart"}</span></span>
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-bold">View cart <ChevronRight className="h-4 w-4" /></span>
      </Link>
    </div>
  );
}
