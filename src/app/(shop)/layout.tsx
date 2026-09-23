import { getSessionUser } from "@/lib/supabase/server";
import { getCartSummary } from "@/lib/actions/cart";
import { getMyAddresses, getMyNotifications } from "@/lib/data/account";
import { Header } from "@/components/shop/header";
import { BottomNav } from "@/components/shop/bottom-nav";
import { CartProvider } from "@/components/shop/cart-provider";
import { StickyCartBar } from "@/components/shop/sticky-cart-bar";
import { Footer } from "@/components/shop/footer";
import { PwaClient } from "@/components/pwa/pwa-client";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const [cart, addresses, notifications] = user ? await Promise.all([getCartSummary(), getMyAddresses(), getMyNotifications(1)]) : [null, [], { items: [], unread: 0 }];
  return (
    <CartProvider initial={cart} signedIn={Boolean(user)}>
      <Header user={user} addresses={addresses} unread={notifications.unread} />
      <main className="mx-auto w-full max-w-6xl flex-1 pb-nav sm:px-6 md:pb-10">{children}</main>
      <Footer />
      <StickyCartBar />
      <BottomNav />
      <PwaClient />
    </CartProvider>
  );
}
