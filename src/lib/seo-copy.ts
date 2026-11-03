import { isRazorpayConfigured } from "@/lib/env";

/** True only when online payment can really be taken: Razorpay keys present and the setting switched on. */
export function onlinePaymentsLive(settings: Record<string, unknown>) {
  return isRazorpayConfigured() && settings.online_payments_enabled !== false;
}

/** One honest sentence about how customers can pay, for titles, descriptions and page copy. */
export function paymentPhrase(settings: Record<string, unknown>) {
  const cod = settings.cod_enabled !== false;
  const online = onlinePaymentsLive(settings);
  if (cod && online) return "Pay by UPI, card or cash on delivery.";
  if (online) return "Pay online by UPI or card.";
  if (cod) return "Cash on delivery available.";
  return "";
}
