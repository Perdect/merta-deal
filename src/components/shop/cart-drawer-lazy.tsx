"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { useCartStore } from "@/stores/cart-store";

type Props = React.ComponentProps<typeof import("./cart-drawer").CartDrawer>;

const CartDrawer = dynamic(() => import("./cart-drawer").then((m) => m.CartDrawer), { ssr: false });

/**
 * The cart panel (with checkout, address wizard, map picker and sign-in) is a large client bundle.
 * It is only downloaded once it can matter: when the cart has items or the panel is opened. Its code
 * is still fetched in the background while the browser is idle, so the first open is instant.
 */
export function CartDrawerLazy(props: Props) {
  const drawer = useCartStore((s) => s.drawer);
  const hasItems = useCartStore((s) => Boolean(s.summary?.items.length));
  const [wanted, setWanted] = React.useState(false);
  if ((drawer || hasItems) && !wanted) setWanted(true);
  React.useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const id = w.requestIdleCallback ? w.requestIdleCallback(() => { void import("./cart-drawer"); }, { timeout: 4000 }) : window.setTimeout(() => { void import("./cart-drawer"); }, 2500);
    return () => { if (w.cancelIdleCallback) w.cancelIdleCallback(id); else clearTimeout(id); };
  }, []);
  return wanted ? <CartDrawer {...props} /> : null;
}
