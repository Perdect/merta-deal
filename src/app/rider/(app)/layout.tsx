import type { Metadata, Viewport } from "next";
import { getMyProfile } from "@/lib/data/account";
import type { RiderLang } from "@/lib/rider-i18n";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyRiderProfile, hasActiveDelivery } from "@/lib/data/rider";
import { RiderShell } from "@/components/rider/rider-shell";
import { RiderFrame } from "@/components/rider/rider-frame";
import { RiderRegistration } from "@/components/rider/rider-registration";
import { PortalTheme } from "@/components/shared/portal-theme";
import { createClient } from "@/lib/supabase/server";
import { env, isPushConfigured } from "@/lib/env";

/** Green address bar / title bar for the rider app; the rest mirrors the root viewport. */
export const viewport: Viewport = { themeColor: "#15803d", width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

export const metadata: Metadata = {
  title: { default: "Delivery partner", template: "%s · Delivery partner | Merta Deal" },
  robots: { index: false, follow: false },
  // The rider app installs on its own (scope /rider) so the home-screen icon opens the rider screens, not the shop.
  manifest: "/rider.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "MD Rider" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
};

/**
 * Delivery partner PWA frame (green theme). No DashboardShell here: this is a one-handed phone app with a
 * compact top bar, the screen and a tab bar, shown as one phone-width column on wider screens (`RiderFrame`). Signed-in customers without a delivery_partners row see the
 * application form (from the "Deliver with Merta Deal" page); applicants see their pending status.
 * Guest sessions are sent to the delivery partner login. Data access is enforced by the rider RPCs.
 */
export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/rider/login");
  const { data: { user: authUser } } = await (await createClient()).auth.getUser();
  if (authUser?.is_anonymous) redirect("/rider/login");
  const rider = await getMyRiderProfile();
  if (!rider) return <div className="theme-rider contents"><PortalTheme portal="rider" /><RiderFrame><RiderRegistration name={user.fullName} /></RiderFrame></div>;
  const [active, profile] = await Promise.all([hasActiveDelivery(rider.id), getMyProfile()]);
  const prefs = (profile?.preferences && typeof profile.preferences === "object" && !Array.isArray(profile.preferences) ? profile.preferences : {}) as { language?: string };
  const initialLang: RiderLang = prefs.language === "hi" ? "hi" : "en";
  return (
    <div className="theme-rider contents">
      <PortalTheme portal="rider" />
      <RiderShell user={{ id: user.id, name: user.fullName }} rider={rider} initialActive={active} initialLang={initialLang} push={{ configured: isPushConfigured(), vapidPublicKey: env.vapidPublicKey }}>
        {children}
      </RiderShell>
    </div>
  );
}
