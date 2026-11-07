import type { Enums } from "@/types/database";

export type OrderStatus = Enums<"order_status">;

export const ORDER_FLOW: OrderStatus[] = ["placed", "confirmed", "preparing", "ready_for_pickup", "rider_assigned", "out_for_delivery", "delivered", "completed"];

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; short: string; description: string; tone: "neutral" | "info" | "warning" | "success" | "danger"; icon: string }> = {
  placed: { label: "Order placed", short: "Placed", description: "Being confirmed", tone: "info", icon: "receipt" },
  confirmed: { label: "Confirmed · packing", short: "Packing", description: "Confirmed; being packed", tone: "info", icon: "package" },
  preparing: { label: "Packing", short: "Packing", description: "Your items are being packed", tone: "info", icon: "package" },
  ready_for_pickup: { label: "Packed", short: "Packed", description: "Packed; assigning a delivery partner", tone: "warning", icon: "package-check" },
  rider_assigned: { label: "Rider assigned", short: "Rider assigned", description: "Rider is picking up the order", tone: "info", icon: "bike" },
  out_for_delivery: { label: "Out for delivery", short: "On the way", description: "Rider is on the way to you", tone: "info", icon: "navigation" },
  delivered: { label: "Delivered", short: "Delivered", description: "Order handed over after OTP check", tone: "success", icon: "check-circle" },
  completed: { label: "Completed", short: "Completed", description: "Thank you for shopping local", tone: "success", icon: "badge-check" },
  cancelled: { label: "Cancelled", short: "Cancelled", description: "This order was cancelled", tone: "danger", icon: "x-circle" },
  rejected: { label: "Could not fulfil", short: "Rejected", description: "We could not fulfil this order", tone: "danger", icon: "x-circle" },
};

export const TERMINAL_STATUSES: OrderStatus[] = ["delivered", "completed", "cancelled", "rejected"];
export const ACTIVE_STATUSES: OrderStatus[] = ["placed", "confirmed", "preparing", "ready_for_pickup", "rider_assigned", "out_for_delivery"];

export function statusIndex(status: OrderStatus) {
  return ORDER_FLOW.indexOf(status);
}

export function canCustomerCancel(status: OrderStatus) {
  return status === "placed" || status === "confirmed";
}

export const PAYMENT_METHOD_LABEL: Record<Enums<"payment_method">, string> = {
  cod: "Cash on Delivery", upi: "UPI", card: "Card", netbanking: "Net Banking", wallet: "Merta Wallet", razorpay: "Online (Razorpay)",
};

export const PAYMENT_STATUS_LABEL: Record<Enums<"payment_status">, string> = {
  pending: "Payment pending", authorized: "Authorized", paid: "Paid", failed: "Payment failed", refunded: "Refunded", partially_refunded: "Partially refunded", cod_pending: "Pay on delivery", cod_collected: "Collected on delivery",
};
