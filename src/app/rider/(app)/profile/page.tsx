import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyRiderProfile, getRiderNotifications } from "@/lib/data/rider";
import { RiderProfile } from "@/components/rider/rider-profile";
import { RiderText } from "@/components/rider/rider-text";
import { ErrorState } from "@/components/ui/states";
import { env, isPushConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/** Everything per rider is fetched here; the sections and the alert setup live in RiderProfile. */
export default async function RiderProfilePage() {
  const [user, rider, notifications] = await Promise.all([getSessionUser(), getMyRiderProfile(), getRiderNotifications(30)]);
  if (!user || !rider) return <ErrorState title="Rider profile not found" retryHref="/rider" />;
  return (
    <div>
      <RiderText k="nav.profile" as="h1" className="sr-only" />
      <RiderProfile user={{ id: user.id, name: user.fullName, phone: user.phone, email: user.email, avatarUrl: user.avatarUrl }} rider={rider} notifications={notifications.items} push={{ configured: isPushConfigured(), vapidPublicKey: env.vapidPublicKey }} />
    </div>
  );
}
