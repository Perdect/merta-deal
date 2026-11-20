import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/data/account";
import { PasswordForm, PreferencesForm, GuestSignInCard, DeleteAccountRequest } from "@/components/account/settings-forms";
import { SignOutButton } from "@/components/account/sign-out-button";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  const user = await getSessionUser();
  if (!user) return null; // the account layout shows the login prompt
  const profile = await getMyProfile();
  if (!profile) return null;
  return (
    <div className="pt-1">
      <PageHeader title="Settings" back="/account" />
      <div className="space-y-4 px-4 sm:px-0">
        {profile.is_guest ? <GuestSignInCard /> : null}
        {/* Customers have no password: they sign in by OTP. Staff accounts (email + password) change theirs here. */}
        {!profile.is_guest && (profile.role !== "customer" || reset === "1") ? <PasswordForm highlight={reset === "1"} /> : null}
        <PreferencesForm profile={profile} />
        <DeleteAccountRequest />
        <SignOutButton />
      </div>
    </div>
  );
}
