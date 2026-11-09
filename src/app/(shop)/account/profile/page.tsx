import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/data/account";
import { AccountSection } from "@/components/account/account-section";
import { ProfileForm } from "@/components/account/profile-form";
import { DeleteAccountRequest, SaveAccountForm } from "@/components/account/settings-forms";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) return null; // the account layout shows the login prompt
  const profile = await getMyProfile();
  if (!profile) return null;
  return (
    <AccountSection title="Profile">
      {/* A guest only needs to save the account; editing and deletion apply to registered accounts. */}
      {profile.is_guest ? <SaveAccountForm profile={profile} /> : (
        <div className="space-y-8">
          <ProfileForm profile={profile} />
          <p className="text-sm text-ink-3">Want to change your sign-in PIN? <Link href="/account/settings" className="font-semibold text-brand-700">Go to Settings &amp; PIN</Link></p>
          <div className="border-t border-line pt-6"><DeleteAccountRequest /></div>
        </div>
      )}
    </AccountSection>
  );
}
