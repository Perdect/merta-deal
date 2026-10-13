import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyRiderProfile, hasActiveDelivery } from "@/lib/data/rider";
import { RiderShell } from "@/components/rider/rider-shell";
import { RiderRegistration } from "@/components/rider/rider-registration";
import { PortalTheme } from "@/components/shared/portal-theme";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { default: "Delivery partner", template: "%s · Delivery partner | Merta Deal" },
  robots: { index: false, follow: false },
};

/**
 * Delivery partner PWA frame (orange theme). No DashboardShell here — this is a one-handed phone app:
 * compact top bar, page, floating dock. Signed-in customers without a delivery_partners row see the
 * application form (from the "Deliver with Merta Deal" page); applicants see their pending status.
 * Guest sessions are sent to the delivery partner login. Data access is enforced by the rider RPCs.
 */
export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/rider/login");
  const { data: { user: authUser } } = await (await createClient()).auth.getUser();
  if (authUser?.is_anonymous) redirect("/rider/login");
  const rider = await getMyRiderProfile();
  if (!rider) return <div className="theme-rider contents"><PortalTheme portal="rider" /><RiderRegistration name={user.fullName} /></div>;
  const active = await hasActiveDelivery(rider.id);
  return (
    <div className="theme-rider contents">
      <PortalTheme portal="rider" />
      <RiderShell user={{ id: user.id, name: user.fullName }} rider={rider} initialActive={active}>
        {children}
      </RiderShell>
    </div>
  );
}
