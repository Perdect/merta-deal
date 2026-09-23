import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet, Star, UserPlus, ChevronRight } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/data/account";
import { ProfileCard } from "@/components/account/profile-card";
import { AccountMenu, type AccountMenuItem } from "@/components/account/account-menu";
import { SignOutButton } from "@/components/account/sign-out-button";
import { PageHeader } from "@/components/ui/misc";
import { Stat } from "@/components/ui/card";
import { formatINR, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "My account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");
  const profile = await getMyProfile();
  if (!profile) redirect("/login?next=/account");

  const menu: AccountMenuItem[] = [
    { href: "/orders", label: "Orders", icon: "package", hint: "History, live tracking, buy again" },
    { href: "/track", label: "Track an order", icon: "navigation", hint: "Enter an order number or short code" },
    { href: "/account/addresses", label: "Addresses", icon: "map-pin", hint: "Home, work and other delivery spots" },
    { href: "/account/wishlist", label: "Wishlist", icon: "heart" },
    { href: "/account/coupons", label: "Coupons & offers", icon: "ticket" },
    { href: "/account/wallet", label: "Wallet", icon: "wallet", hint: `${formatINR(profile.wallet_balance)} balance` },
    { href: "/account/rewards", label: "Rewards", icon: "star", hint: `${formatNumber(profile.reward_points)} points` },
    { href: "/account/notifications", label: "Notifications", icon: "bell" },
    { href: "/account/support", label: "Help & support", icon: "life-buoy" },
    { href: "/account/settings", label: "Settings", icon: "settings", hint: "Password, email, preferences" },
  ];
  const workspace: AccountMenuItem[] = [];
  if (profile.role === "store_owner" || profile.role === "store_staff") workspace.push({ href: "/store", label: "Store dashboard", icon: "store", hint: "Orders, inventory and earnings" });
  if (profile.role === "rider") workspace.push({ href: "/rider", label: "Rider app", icon: "bike", hint: "Deliveries and earnings" });
  if (profile.role === "admin" || profile.role === "super_admin") workspace.push({ href: "/admin", label: "Admin console", icon: "layout", hint: "Manage the marketplace" });

  return (
    <div className="pt-1">
      <PageHeader title="My account" />
      <div className="space-y-4 px-4 sm:px-0">
        {profile.is_guest ? (
          <Link href="/account/settings#save-account" className="flex items-center gap-3 rounded-lg border border-saffron-300 bg-saffron-50 p-4 shadow-card transition-shadow hover:shadow-float">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-saffron-500 text-ink"><UserPlus className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink">Save your account</span>
              <span className="block text-xs text-ink-2">You&apos;re a guest. Add an email and password to keep your orders, addresses and wallet on any device.</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
          </Link>
        ) : null}

        <ProfileCard profile={profile} email={user.email} />

        <div className="grid grid-cols-2 gap-3">
          <Link href="/account/wallet" className="block rounded-lg transition-shadow hover:shadow-float"><Stat label="Wallet" value={formatINR(profile.wallet_balance)} hint="Tap to see transactions" tone="brand" icon={<Wallet className="h-4 w-4" />} /></Link>
          <Link href="/account/rewards" className="block rounded-lg transition-shadow hover:shadow-float"><Stat label="Reward points" value={formatNumber(profile.reward_points)} hint="Earn on every delivered order" tone="saffron" icon={<Star className="h-4 w-4" />} /></Link>
        </div>

        <AccountMenu items={workspace} title="Your workspace" />
        <AccountMenu items={menu} />
        <SignOutButton />
      </div>
    </div>
  );
}
