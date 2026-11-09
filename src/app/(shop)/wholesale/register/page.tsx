import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppBar } from "@/components/shop/app-bar";
import { PleaseLogin } from "@/components/auth/please-login";
import { RegisterShopForm } from "@/components/wholesale/register-form";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyAddresses, getMyProfile } from "@/lib/data/account";
import { getMyShop } from "@/lib/data/wholesale";
import { getPublicSettings } from "@/lib/data/catalog";
import { etaText } from "@/lib/eta";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "Register your kirana shop", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function RegisterShopPage() {
  const [user, settings] = await Promise.all([getSessionUser(), getPublicSettings()]);
  const eta = etaText(Number(settings.delivery_eta_min_minutes), Number(settings.delivery_eta_max_minutes)) ?? "minutes";
  if (!user) return <PleaseLogin description="Please login with your mobile number to register your shop." eta={eta} loginTitle="Login to register your shop" />;
  const [profile, addresses, mine] = await Promise.all([getMyProfile(), getMyAddresses(), getMyShop()]);
  if (profile?.is_guest) return <PleaseLogin description="Please login with your mobile number to register your shop." eta={eta} loginTitle="Login to register your shop" />;
  if (mine.shop && (mine.shop.status === "approved" || mine.shop.status === "suspended")) redirect("/account/shop");
  return (
    <div className="px-4 pb-10 pt-1 sm:px-0">
      <AppBar title="Register your shop" back="/wholesale" className="-mt-1" />
      <div className="mx-auto max-w-2xl">
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink">{mine.shop ? "Update your shop registration" : `Wholesale account for your shop in ${site.city}`}</h1>
        <p className="mt-1 text-sm text-ink-2">{mine.shop?.status === "rejected" && mine.shop.review_note ? `Last time we could not approve it: ${mine.shop.review_note}` : "Takes two minutes. We call to verify, then you set up your monthly list."}</p>
        <div className="mt-4"><RegisterShopForm addresses={addresses} defaults={{ name: profile?.full_name ?? user.fullName, phone: profile?.phone ?? user.phone }} /></div>
      </div>
    </div>
  );
}
