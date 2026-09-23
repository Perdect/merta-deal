import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/data/account";
import { PasswordForm, PreferencesForm, SaveAccountForm, DeleteAccountRequest } from "@/components/account/settings-forms";
import { SignOutButton } from "@/components/account/sign-out-button";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/settings");
  const profile = await getMyProfile();
  if (!profile) redirect("/login?next=/account/settings");
  return (
    <div className="pt-1">
      <PageHeader title="Settings" back="/account" />
      <div className="space-y-4 px-4 sm:px-0">
        {profile.is_guest ? <SaveAccountForm profile={profile} /> : null}
        {!profile.is_guest ? <PasswordForm highlight={reset === "1"} /> : null}
        <PreferencesForm profile={profile} />
        <DeleteAccountRequest />
        <SignOutButton />
      </div>
    </div>
  );
}
