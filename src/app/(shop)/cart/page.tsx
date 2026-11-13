import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getCartSummary } from "@/lib/actions/cart";
import { getAvailableCoupons, getMyAddresses, getMyProfile } from "@/lib/data/account";
import { CartView } from "@/components/shop/cart-view";
import { ShopPageHeader } from "@/components/shop/shop-page-header";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const user = await getSessionUser();
  // No session at all (not even a guest one): nothing has been added yet.
  if (!user) return <EmptyState icon={<ShoppingBag className="h-7 w-7" />} title="Your cart is empty" description="Add groceries, sweets and cakes — delivered in minutes." action={<Button href="/categories">Start shopping</Button>} />;
  const [summary, coupons, addresses, profile] = await Promise.all([getCartSummary(), getAvailableCoupons(), getMyAddresses(), getMyProfile()]);
  return (
    <div className="pt-1">
      <ShopPageHeader title="Cart" fallback="/" barClassName="-mt-1" subtitle={summary && !summary.empty ? `${summary.item_count} item${summary.item_count === 1 ? "" : "s"}` : undefined} />
      <CartView initial={summary} coupons={coupons.map((c) => ({ code: c.code, title: c.title, min_order_amount: Number(c.min_order_amount) }))} addresses={addresses} signedIn isGuest={Boolean(profile?.is_guest)} />
    </div>
  );
}
