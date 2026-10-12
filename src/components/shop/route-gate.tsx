"use client";
import { usePathname } from "next/navigation";

/**
 * Renders `fallback` (or nothing) on routes that bring their own chrome — the product page swaps
 * the full green band for a one-line delivery strip and its own floating controls.
 */
export function HideOnRoutes({ prefixes, children, fallback = null }: { prefixes: string[]; children: React.ReactNode; fallback?: React.ReactNode }) {
  const pathname = usePathname();
  if (prefixes.some((p) => pathname.startsWith(p))) return <>{fallback}</>;
  return <>{children}</>;
}
