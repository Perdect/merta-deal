"use client";
import { useCartStore } from "@/stores/cart-store";

export function CartCount() {
  const count = useCartStore((s) => s.totalCount());
  if (!count) return null;
  return <span key={count} aria-hidden className="absolute right-0.5 top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-saffron-500 px-1 text-[10px] font-bold text-ink motion-safe:animate-bump">{count}</span>;
}
