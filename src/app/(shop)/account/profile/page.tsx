import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/data/account";
import { AccountSection } from "@/components/account/account-section";
import { ProfileForm } from "@/components/account/profile-form";
import { DeleteAccountRequest, SaveAccountForm } from "@/components/account/settings-forms";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/profile");
  const profile = await getMyProfile();
  if (!profile) redirect("/login?next=/account/profile");
  return (
    <AccountSection title="Profile">
      <div className="space-y-8">
        {profile.is_guest ? <SaveAccountForm profile={profile} /> : null}
        <ProfileForm profile={profile} email={user.email} />
        <p className="text-sm text-ink-3">Want to change your sign-in PIN? <Link href="/account/settings" className="font-semibold text-brand-700">Go to Settings & PIN</Link></p>
        <div className="border-t border-line pt-6"><DeleteAccountRequest /></div>
      </div>
    </AccountSection>
  );
}
