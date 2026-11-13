import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyRiderProfile, getRiderNotifications } from "@/lib/data/rider";
import { RiderProfile } from "@/components/rider/rider-profile";
import { RiderText } from "@/components/rider/rider-text";
import { ErrorState } from "@/components/ui/states";
import { AlertSetup } from "@/components/alerts/alert-setup";
import { env, isPushConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function RiderProfilePage() {
  const [user, rider, notifications] = await Promise.all([getSessionUser(), getMyRiderProfile(), getRiderNotifications(30)]);
  if (!user || !rider) return <ErrorState title="Rider profile not found" retryHref="/rider" />;
  return (
    <div>
      <RiderText k="nav.profile" as="h1" />
      <section id="alerts" className="mb-4 rounded-2xl bg-card p-4 shadow-card" aria-labelledby="rider-alerts-title">
        <RiderText k="alerts.title" as="h2" className="font-display text-[16px] font-extrabold text-ink" />
        <RiderText k="alerts.body" as="p" className="mb-3 text-xs text-ink-3" />
        <AlertSetup portal="rider" push={{ configured: isPushConfigured(), vapidPublicKey: env.vapidPublicKey }} />
      </section>
      <RiderProfile user={{ id: user.id, name: user.fullName, phone: user.phone, email: user.email, avatarUrl: user.avatarUrl }} rider={rider} notifications={notifications.items} />
    </div>
  );
}
