import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyRiderProfile, getRiderNotifications } from "@/lib/data/rider";
import { RiderProfile } from "@/components/rider/rider-profile";
import { RiderText } from "@/components/rider/rider-text";
import { ErrorState } from "@/components/ui/states";
import { env, isPushConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/data/account";
import { riderSmsStatus } from "@/lib/notifications/rider-alerts";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/** Everything per rider is fetched here; the sections and the alert setup live in RiderProfile. */
export default async function RiderProfilePage() {
  const [user, rider, notifications, profile, smsSetting] = await Promise.all([getSessionUser(), getMyRiderProfile(), getRiderNotifications(30), getMyProfile(), riderSmsSwitch()]);
  if (!user || !rider) return <ErrorState title="Rider profile not found" retryHref="/rider" />;
  const prefs = (profile?.preferences && typeof profile.preferences === "object" && !Array.isArray(profile.preferences) ? profile.preferences : {}) as { rider_sms_alerts?: unknown };
  // Only whether the server can send rider SMS at all (never which settings are missing) reaches the phone.
  const sms = { configured: riderSmsStatus().configured, enabled: smsSetting, optedIn: prefs.rider_sms_alerts === true, phone: user.phone };
  return (
    <div>
      <RiderText k="nav.profile" as="h1" className="sr-only" />
      <RiderProfile user={{ id: user.id, name: user.fullName, phone: user.phone, email: user.email, avatarUrl: user.avatarUrl }} rider={rider} notifications={notifications.items} push={{ configured: isPushConfigured(), vapidPublicKey: env.vapidPublicKey }} sms={sms} />
    </div>
  );
}

/** The owner's switch for rider SMS (settings, public). Missing row (before migration 0058) reads as on: the server check still decides. */
async function riderSmsSwitch(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("value").eq("key", "rider_sms_alerts_enabled").maybeSingle();
  return data ? data.value !== false && data.value !== "false" : true;
}
