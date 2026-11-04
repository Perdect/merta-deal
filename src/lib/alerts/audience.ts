/**
 * Who a notification type is meant for. One account can be a customer, an admin and a rider at once
 * (the inbox is per user), so each row is labelled with the role it belongs to.
 */
export type Audience = "customer" | "admin" | "rider";

const ADMIN = new Set(["new_order", "payment_update", "rider_assigned", "order_delivered", "order_cancelled", "low_stock", "dispatch_no_rider", "order_unattended", "rider_registered", "store_registered"]);
const RIDER = new Set(["delivery_offer", "cash_received", "rider_payout", "rider_status"]);

export function audienceOf(type: string, context: Audience = "customer"): Audience {
  if (ADMIN.has(type)) return "admin";
  if (RIDER.has(type)) return "rider";
  // delivery_failed is written for the customer, the admins and the store with different bodies.
  if (type === "delivery_failed") return context;
  return "customer";
}

export const AUDIENCE_LABEL: Record<Audience, string> = { customer: "Customer", admin: "Admin", rider: "Rider" };

/** Types that ring: the dashboard and the rider app treat these as alerts, not news. */
export const ALERT_TYPES = new Set(["new_order", "delivery_offer", "order_unattended", "dispatch_no_rider"]);
