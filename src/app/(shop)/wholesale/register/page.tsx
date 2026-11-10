import type { Metadata } from "next";
import { AppBar } from "@/components/shop/app-bar";
import { PleaseLogin } from "@/components/auth/please-login";
import { WholesaleProfileForm } from "@/components/wholesale/register-form";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyAddresses, getMyProfile } from "@/lib/data/account";
import { getMyWholesale } from "@/lib/data/wholesale";
import { getPublicSettings } from "@/lib/data/catalog";
import { etaText } from "@/lib/eta";

export const metadata: Metadata = { title: "Wholesale details", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Optional details for wholesale bills and delivery: shop name and GSTIN for shops, contact, address, monthly needs. Not a registration gate. */
export default async function WholesaleDetailsPage() {
  const [user, settings] = await Promise.all([getSessionUser(), getPublicSettings()]);
  const eta = etaText(Number(settings.delivery_eta_min_minutes), Number(settings.delivery_eta_max_minutes)) ?? "minutes";
  if (!user) return <PleaseLogin description="Please login with your mobile number to save your wholesale details." eta={eta} loginTitle="Login to continue" />;
  const [profile, addresses, mine] = await Promise.all([getMyProfile(), getMyAddresses(), getMyWholesale()]);
  if (profile?.is_guest) return <PleaseLogin description="Please login with your mobile number to save your wholesale details." eta={eta} loginTitle="Login to continue" />;
  return (
    <div className="px-4 pb-10 pt-1 sm:px-0">
      <AppBar title="Wholesale details" back="/wholesale" className="-mt-1" />
      <div className="mx-auto max-w-2xl">
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink">Your wholesale details</h1>
        <p className="mt-1 text-sm text-ink-2">All optional. Add a shop name and GSTIN if you want them on your bills, and pick the address wholesale orders should go to.</p>
        <div className="mt-4"><WholesaleProfileForm addresses={addresses} current={mine.shop} defaults={{ name: profile?.full_name ?? user.fullName, phone: profile?.phone ?? user.phone }} /></div>
      </div>
    </div>
  );
}
