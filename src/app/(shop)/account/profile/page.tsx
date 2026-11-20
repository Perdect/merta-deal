import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/data/account";
import { AccountSection } from "@/components/account/account-section";
import { ProfileForm } from "@/components/account/profile-form";
import { DeleteAccountRequest, GuestSignInCard } from "@/components/account/settings-forms";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) return null; // the account layout shows the login prompt
  const profile = await getMyProfile();
  if (!profile) return null;
  return (
    <AccountSection title="Profile">
      {/* A guest only needs to sign in; editing and deletion apply to registered accounts. */}
      {profile.is_guest ? <GuestSignInCard /> : (
        <div className="space-y-8">
          <ProfileForm profile={profile} />
          <div className="border-t border-line pt-6"><DeleteAccountRequest /></div>
        </div>
      )}
    </AccountSection>
  );
}
