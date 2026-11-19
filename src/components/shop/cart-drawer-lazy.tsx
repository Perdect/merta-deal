"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { useCartStore } from "@/stores/cart-store";
import { useMeStore } from "@/stores/me-store";

type DrawerProps = React.ComponentProps<typeof import("./cart-drawer").CartDrawer>;
/** Settings-derived props come from the layout; who is signed in, their addresses, wallet and coupons come from `/api/me`. */
type Props = Pick<DrawerProps, "razorpayEnabled" | "codEnabled" | "verifyMobile" | "slots" | "slotRules" | "eta">;

const CartDrawer = dynamic(() => import("./cart-drawer").then((m) => m.CartDrawer), { ssr: false });
const NONE: never[] = [];

/**
 * The cart panel (with checkout, address wizard, map picker and sign-in) is a large client bundle.
 * It is only downloaded once it can matter: when the cart has items or the panel is opened. Its code
 * is still fetched in the background while the browser is idle, so the first open is instant.
 */
export function CartDrawerLazy(props: Props) {
  const drawer = useCartStore((s) => s.drawer);
  const sheet = useCartStore((s) => s.sheet);
  const hasItems = useCartStore((s) => Boolean(s.summary?.items.length));
  const me = useMeStore((s) => s.me);
  const [wanted, setWanted] = React.useState(false);
  if ((drawer || sheet || hasItems) && !wanted) setWanted(true);
  React.useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const id = w.requestIdleCallback ? w.requestIdleCallback(() => { void import("./cart-drawer"); }, { timeout: 4000 }) : window.setTimeout(() => { void import("./cart-drawer"); }, 2500);
    return () => { if (w.cancelIdleCallback) w.cancelIdleCallback(id); else clearTimeout(id); };
  }, []);
  if (!wanted) return null;
  return <CartDrawer {...props} signedIn={Boolean(me?.user)} isGuest={Boolean(me?.isGuest)} addresses={me?.addresses ?? NONE} walletBalance={me?.walletBalance ?? 0}
    coupons={(me?.coupons ?? NONE).map((c) => ({ code: c.code, title: c.title, min_order_amount: Number(c.min_order_amount) })) as DrawerProps["coupons"]} user={{ name: me?.name ?? null, phone: me?.phone ?? null }} />;
}
