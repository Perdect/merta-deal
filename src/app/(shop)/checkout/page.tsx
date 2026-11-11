import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, createClient } from "@/lib/supabase/server";
import { getCartSummary } from "@/lib/actions/cart";
import { getMyAddresses, getMyProfile } from "@/lib/data/account";
import { getPublicSettings } from "@/lib/data/catalog";
import { CheckoutView } from "@/components/shop/checkout-view";
import { ShopPageHeader } from "@/components/shop/shop-page-header";
import { isRazorpayConfigured } from "@/lib/env";
import { etaText } from "@/lib/eta";
import { PleaseLogin } from "@/components/auth/please-login";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await getSessionUser();
  const settings = await getPublicSettings();
  const eta = etaText(Number(settings.delivery_eta_min_minutes), Number(settings.delivery_eta_max_minutes)) ?? "minutes";
  if (!user) return <PleaseLogin description="Please login to place your order." eta={eta} loginTitle="Login to place your order" />;
  const [summary, addresses, profile, cap] = await Promise.all([getCartSummary(), getMyAddresses(), getMyProfile(), (await createClient()).rpc("order_capacity")]);
  const accepting = (cap.data as { accepting?: boolean } | null)?.accepting !== false;
  // Guests check out without an OTP: the order carries the name and mobile given with the address.
  if (!summary || summary.empty) redirect("/cart");
  const addr = addresses.find((a) => a.is_default) ?? addresses[0];
  const slots = Array.isArray(settings.scheduled_slots) ? (settings.scheduled_slots as string[]) : [];
  return (
    <div className="pt-1">
      <ShopPageHeader title="Checkout" back="/cart" subtitle={`${summary.item_count} item${summary.item_count === 1 ? "" : "s"}`} />
      <CheckoutView initial={summary} addresses={addresses} walletBalance={Number(profile?.wallet_balance ?? 0)} razorpayEnabled={isRazorpayConfigured() && settings.online_payments_enabled !== false} codEnabled={settings.cod_enabled !== false} slots={slots} slotRules={{ leadMinutes: Number(settings.scheduled_slot_lead_minutes) || 30, daysAhead: Number(settings.scheduled_days_ahead) || 2 }} accepting={accepting} user={{ name: (profile?.is_guest ? addr?.full_name : null) ?? profile?.full_name ?? user.fullName, phone: (profile?.is_guest ? addr?.phone : null) ?? profile?.phone ?? user.phone }} />
    </div>
  );
}
