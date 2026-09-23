import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyRiderProfile, getRiderNotifications } from "@/lib/data/rider";
import { RiderProfile } from "@/components/rider/rider-profile";
import { ErrorState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function RiderProfilePage() {
  const [user, rider, notifications] = await Promise.all([getSessionUser(), getMyRiderProfile(), getRiderNotifications(30)]);
  if (!user || !rider) return <ErrorState title="Rider profile not found" retryHref="/rider" />;
  return (
    <div>
      <h1 className="mb-3 font-display text-xl font-extrabold text-ink">Profile</h1>
      <RiderProfile user={{ id: user.id, name: user.fullName, phone: user.phone, email: user.email, avatarUrl: user.avatarUrl }} rider={rider} notifications={notifications.items} />
    </div>
  );
}
