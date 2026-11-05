import { getSessionUser } from "@/lib/supabase/server";
import { getCartSummary } from "@/lib/actions/cart";
import { getMyAddresses, getMyNotifications, getMyProfile, getAvailableCoupons } from "@/lib/data/account";
import { isRazorpayConfigured } from "@/lib/env";
import { getPublicSettings } from "@/lib/data/catalog";
import { Header } from "@/components/shop/header";
import { BottomNav } from "@/components/shop/bottom-nav";
import { ChromePart, NavHistory, NavSpacer } from "@/components/shop/app-view";
import { CartProvider } from "@/components/shop/cart-provider";
import { StickyCartBar } from "@/components/shop/sticky-cart-bar";
import { CartDrawerLazy } from "@/components/shop/cart-drawer-lazy";
import { Footer } from "@/components/shop/footer";
import { socialLinks } from "@/lib/social";
import { PwaClient } from "@/components/pwa/pwa-client";
import { ConnectionIndicator } from "@/components/pwa/connection-indicator";
import { UpdatePrompt } from "@/components/pwa/update-prompt";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // Delivery ETA is a business rule: it comes from the `settings` table, never the markup.
  // Settings are fetched alongside the user's data rather than after it.
  const [[cart, addresses, notifications, profile, coupons], settings] = await Promise.all([
    user
      ? Promise.all([getCartSummary(), getMyAddresses(), getMyNotifications(1), getMyProfile(), getAvailableCoupons()])
      : Promise.resolve([null, [] as Awaited<ReturnType<typeof getMyAddresses>>, { items: [], unread: 0 }, null, [] as Awaited<ReturnType<typeof getAvailableCoupons>>] as const),
    getPublicSettings(),
  ]);
  const num = (k: string, d: number) => { const v = Number(settings[k]); return Number.isFinite(v) && v > 0 ? v : d; };
  const defaultEta = { min: num("delivery_eta_min_minutes", 30), max: num("delivery_eta_max_minutes", 60) };
  const slots = Array.isArray(settings.scheduled_slots) ? (settings.scheduled_slots as string[]) : [];
  return (
    <CartProvider initial={cart} signedIn={Boolean(user)}>
      <NavHistory />
      <ChromePart part="header"><Header user={user} addresses={addresses} unread={notifications.unread} defaultEta={defaultEta} /></ChromePart>
      <main className="mx-auto w-full max-w-6xl flex-1 pb-2 sm:px-6 md:pb-10">{children}</main>
      <ChromePart part="footer"><Footer social={socialLinks(settings)} /></ChromePart>
      <ChromePart part="cartBar"><StickyCartBar /></ChromePart>
      <NavSpacer />
      <CartDrawerLazy signedIn={Boolean(user)} isGuest={Boolean(profile?.is_guest)} addresses={addresses} walletBalance={Number(profile?.wallet_balance ?? 0)}
        razorpayEnabled={isRazorpayConfigured() && settings.online_payments_enabled !== false} codEnabled={settings.cod_enabled !== false} slots={slots}
        coupons={coupons.map((c) => ({ code: c.code, title: c.title, min_order_amount: Number(c.min_order_amount) }))}
        user={{ name: profile?.full_name ?? user?.fullName ?? null, phone: profile?.phone ?? user?.phone ?? null }} eta={defaultEta} />
      <ChromePart part="bottomNav"><BottomNav unread={notifications.unread} /></ChromePart>
      <PwaClient />
      <UpdatePrompt />
      <ConnectionIndicator />
    </CartProvider>
  );
}
