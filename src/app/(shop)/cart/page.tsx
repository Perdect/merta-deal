import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getCartSummary } from "@/lib/actions/cart";
import { getAvailableCoupons } from "@/lib/data/account";
import { CartView } from "@/components/shop/cart-view";
import { ShopPageHeader } from "@/components/shop/shop-page-header";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const user = await getSessionUser();
  if (!user) return <EmptyState icon={<ShoppingBag className="h-7 w-7" />} title="Sign in to see your cart" description="Your cart is saved to your account so you can pick up where you left off." action={<Button href="/login?next=/cart">Sign in</Button>} />;
  const [summary, coupons] = await Promise.all([getCartSummary(), getAvailableCoupons()]);
  return (
    <div className="pt-1">
      <ShopPageHeader title="Cart" fallback="/" barClassName="-mt-1" subtitle={summary && !summary.empty ? `${summary.item_count} item${summary.item_count === 1 ? "" : "s"}` : undefined} />
      <CartView initial={summary} coupons={coupons.map((c) => ({ code: c.code, title: c.title, min_order_amount: Number(c.min_order_amount) }))} />
    </div>
  );
}
