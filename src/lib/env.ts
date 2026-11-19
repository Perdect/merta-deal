/**
 * Central place to read environment configuration. Every optional integration has a
 * clear "is configured" flag so the UI can show honest setup notices instead of faking behaviour.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
  mapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  mapsMapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID",
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  phoneAuthEnabled: process.env.NEXT_PUBLIC_PHONE_AUTH_ENABLED === "true",
  anonymousAuthEnabled: process.env.NEXT_PUBLIC_ANONYMOUS_AUTH_ENABLED === "true",
  /** Google Play listing for the Android app; empty until it is published. */
  playStoreUrl: process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? "",
} as const;

export const isSupabaseConfigured = () => Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isRazorpayConfigured = () => Boolean(env.razorpayKeyId);
export const isMapsConfigured = () => Boolean(env.mapsKey);
export const isPushConfigured = () => Boolean(env.vapidPublicKey);

/** Server-only secrets (never imported by client components). */
export const serverEnv = () => ({
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  mapsServerKey: process.env.GOOGLE_MAPS_SERVER_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:help@mertadeal.in",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  whatsappToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET ?? "",
});

export type IntegrationStatus = { key: string; label: string; configured: boolean; envVars: string[]; note: string };

/** Used by /setup and admin settings to show what is live vs. what needs credentials. */
export function integrationStatus(): IntegrationStatus[] {
  const s = serverEnv();
  return [
    { key: "supabase", label: "Supabase (database, auth, realtime, storage)", configured: isSupabaseConfigured(), envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"], note: "Required. Apply supabase/migrations then supabase/seed.sql." },
    { key: "service_role", label: "Supabase service role (webhooks, push fan-out)", configured: Boolean(s.serviceRoleKey), envVars: ["SUPABASE_SERVICE_ROLE_KEY"], note: "Needed for Razorpay webhooks, server-side push delivery, product photo import and admin PIN resets." },
    { key: "razorpay", label: "Razorpay (UPI, cards, net banking)", configured: Boolean(s.razorpayKeyId && s.razorpayKeySecret), envVars: ["NEXT_PUBLIC_RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"], note: "Cash on Delivery works without it. Online methods are shown as unavailable until configured." },
    { key: "maps", label: "Google Maps (customer map, rider navigation, ETA)", configured: Boolean(env.mapsKey), envVars: ["NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_SERVER_API_KEY"], note: "Live rider GPS still streams via Supabase Realtime; the map tile and route ETA need this key." },
    { key: "push", label: "Web Push (VAPID)", configured: Boolean(env.vapidPublicKey && s.vapidPrivateKey), envVars: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"], note: "In-app notifications work without it. Generate keys with `pnpm push:keys`." },
    { key: "anthropic", label: "Claude AI (shopping assistant, voice order parsing)", configured: Boolean(s.anthropicKey), envVars: ["ANTHROPIC_API_KEY"], note: "Without it the assistant falls back to a rule-based Hinglish parser (clearly labelled)." },
    { key: "whatsapp", label: "WhatsApp Cloud API (ordering via WhatsApp)", configured: Boolean(s.whatsappToken && s.whatsappPhoneId && s.whatsappVerifyToken), envVars: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"], note: "Webhook at /api/webhooks/whatsapp is implemented; connect a Meta app to enable." },
    { key: "phone_auth", label: "Mobile OTP login (Supabase SMS provider)", configured: env.phoneAuthEnabled, envVars: ["NEXT_PUBLIC_PHONE_AUTH_ENABLED"], note: "Enable an SMS provider (MSG91/Twilio) in Supabase Auth, then set this flag to true." },
    { key: "otp_sms", label: "Login OTP by SMS (Parken panel, through the Supabase Send SMS hook)", configured: Boolean(process.env.SEND_SMS_HOOK_SECRET && process.env.PARKEN_SMS_KEY && process.env.PARKEN_SMS_SENDER && process.env.PARKEN_SMS_TEMPLATE_ID && process.env.PARKEN_SMS_TEMPLATE?.includes("{otp}")), envVars: ["SEND_SMS_HOOK_SECRET", "PARKEN_SMS_KEY", "PARKEN_SMS_SENDER", "PARKEN_SMS_TEMPLATE_ID", "PARKEN_SMS_TEMPLATE"], note: "Needs a DLT-approved sender ID and OTP template added in the Parken panel. Then switch on the Send SMS hook in Supabase Auth with the URL /api/auth/sms-hook. Until then the OTP goes through whichever SMS provider Supabase is set to." },
    { key: "anonymous_auth", label: "Guest checkout (Supabase anonymous sign-in)", configured: env.anonymousAuthEnabled, envVars: ["NEXT_PUBLIC_ANONYMOUS_AUTH_ENABLED"], note: "Scan-QR → order → pay without registering. Turn on 'Allow anonymous sign-ins' in Supabase Auth settings, then set this flag to true." },
  ];
}
