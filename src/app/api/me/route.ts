import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { getCartSummary } from "@/lib/actions/cart";
import { getMyAddresses, getMyNotifications, getMyProfile, getAvailableCoupons } from "@/lib/data/account";
import type { Me } from "@/stores/me-store";

export const dynamic = "force-dynamic";

/**
 * The personal part of the shop chrome in one round trip: who is signed in, their cart, addresses,
 * unread count, wallet and the live coupons. The catalogue pages are cached on the CDN without any of
 * this; the browser asks here once the page is on screen (`MeProvider`). Never cached.
 */
export async function GET() {
  const user = await getSessionUser();
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) {
    const body: Me = { user: null, isGuest: false, name: null, phone: null, walletBalance: 0, addresses: [], unread: 0, coupons: [], cart: null };
    return NextResponse.json(body, { headers });
  }
  const [cart, addresses, notifications, profile, coupons] = await Promise.all([getCartSummary(), getMyAddresses(), getMyNotifications(1), getMyProfile(), getAvailableCoupons()]);
  const body: Me = {
    user, isGuest: Boolean(profile?.is_guest), name: profile?.full_name ?? user.fullName ?? null, phone: profile?.phone ?? user.phone ?? null,
    walletBalance: Number(profile?.wallet_balance ?? 0), addresses, unread: notifications.unread, coupons, cart,
  };
  return NextResponse.json(body, { headers });
}
