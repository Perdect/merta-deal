"use client";
import { ShoppingCart } from "lucide-react";
import { useCartStore } from "@/stores/cart-store";
import { CartCount } from "./cart-count";
import { cn } from "@/lib/utils";

/** Header cart icon: opens the slide-in cart panel instead of leaving the page. */
export function CartButton({ className }: { className?: string }) {
  const openDrawer = useCartStore((s) => s.openDrawer);
  const count = useCartStore((s) => s.totalCount());
  return (
    <button type="button" onClick={() => openDrawer("cart")} aria-label={count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"} className={cn("relative flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2", className)}>
      <ShoppingCart className="h-5 w-5" /><CartCount />
    </button>
  );
}
