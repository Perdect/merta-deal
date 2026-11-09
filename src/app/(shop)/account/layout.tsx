import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/data/account";
import { getPublicSettings } from "@/lib/data/catalog";
import { etaText } from "@/lib/eta";
import { PleaseLogin } from "@/components/auth/please-login";
import { AccountShell, type WorkspaceLink } from "@/components/account/account-shell";

/** Private customer area: never indexed (authentication protects it regardless). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const profile = user ? await getMyProfile() : null;
  if (!user || !profile) {
    const settings = await getPublicSettings();
    return <PleaseLogin eta={etaText(Number(settings.delivery_eta_min_minutes), Number(settings.delivery_eta_max_minutes)) ?? "minutes"} loginTitle="Login to access your account" />;
  }
  const workspace: WorkspaceLink[] = [];
  if (profile.role === "rider") workspace.push({ href: "/rider", label: "Rider app", icon: "bike" });
  if (profile.role === "admin" || profile.role === "super_admin") workspace.push({ href: "/admin", label: "Admin console", icon: "layout" });
  return (
    <AccountShell name={profile.full_name} phone={profile.phone} avatarUrl={profile.avatar_url} walletBalance={Number(profile.wallet_balance)} isGuest={profile.is_guest} workspace={workspace}>
      {children}
    </AccountShell>
  );
}
