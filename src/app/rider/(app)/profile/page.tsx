import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyRiderProfile, getRiderNotifications } from "@/lib/data/rider";
import { RiderProfile } from "@/components/rider/rider-profile";
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
      <h1 className="mb-3 font-display text-xl font-extrabold text-ink">Profile</h1>
      <section id="alerts" className="mb-4 rounded-lg border border-line bg-card p-4 shadow-card" aria-labelledby="rider-alerts-title">
        <h2 id="rider-alerts-title" className="text-base font-bold text-ink">Delivery request alerts</h2>
        <p className="mb-3 text-xs text-ink-3">Make this phone ring when a delivery is offered to you.</p>
        <AlertSetup portal="rider" push={{ configured: isPushConfigured(), vapidPublicKey: env.vapidPublicKey }} />
      </section>
      <RiderProfile user={{ id: user.id, name: user.fullName, phone: user.phone, email: user.email, avatarUrl: user.avatarUrl }} rider={rider} notifications={notifications.items} />
    </div>
  );
}
