/**
 * Privacy-minimal commerce analytics (Google Analytics 4). Active only when
 * NEXT_PUBLIC_GA_MEASUREMENT_ID is set; otherwise every call is a no-op.
 *
 * Never send personal data: no names, phone numbers, emails, addresses or user ids. Events carry
 * product slugs/names, prices and order totals only. Order numbers are internal references.
 */
export type AnalyticsItem = { item_id: string; item_name?: string; price?: number; quantity?: number; item_category?: string };
type Gtag = (cmd: "event", name: string, params: Record<string, unknown>) => void;

export function track(name: "view_item" | "add_to_cart" | "purchase" | "begin_checkout", params: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== "function") return;
  try { gtag("event", name, { currency: "INR", ...params }); } catch { /* analytics must never break shopping */ }
}
