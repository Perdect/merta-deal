import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyRiderProfile, hasActiveDelivery } from "@/lib/data/rider";
import { RiderShell } from "@/components/rider/rider-shell";
import { RiderRegistration } from "@/components/rider/rider-registration";

export const metadata: Metadata = {
  title: { default: "Rider", template: "%s | Merta Deal Rider" },
  robots: { index: false, follow: false },
};

/**
 * Rider PWA frame. No DashboardShell here — this is a one-handed phone app: compact top bar,
 * page, floating dock. Users without a delivery_partners row see the registration page instead.
 */
export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/rider");
  const rider = await getMyRiderProfile();
  if (!rider) return <RiderRegistration name={user.fullName} />;
  const active = await hasActiveDelivery(rider.id);
  return (
    <RiderShell user={{ id: user.id, name: user.fullName }} rider={rider} initialActive={active}>
      {children}
    </RiderShell>
  );
}
