import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getCartSummary } from "@/lib/actions/cart";
import { getMyAddresses, getMyProfile } from "@/lib/data/account";
import { getPublicSettings } from "@/lib/data/catalog";
import { CheckoutView } from "@/components/shop/checkout-view";
import { ShopPageHeader } from "@/components/shop/shop-page-header";
import { isRazorpayConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/checkout");
  const [summary, addresses, profile, settings] = await Promise.all([getCartSummary(), getMyAddresses(), getMyProfile(), getPublicSettings()]);
  if (!summary || summary.empty) redirect("/cart");
  const slots = Array.isArray(settings.scheduled_slots) ? (settings.scheduled_slots as string[]) : [];
  return (
    <div className="pt-1">
      <ShopPageHeader title="Checkout" back="/cart" subtitle={`${summary.item_count} item${summary.item_count === 1 ? "" : "s"}`} />
      <CheckoutView initial={summary} addresses={addresses} walletBalance={Number(profile?.wallet_balance ?? 0)} razorpayEnabled={isRazorpayConfigured() && settings.online_payments_enabled !== false} codEnabled={settings.cod_enabled !== false} slots={slots} user={{ name: profile?.full_name ?? user.fullName, phone: profile?.phone ?? user.phone }} />
    </div>
  );
}
