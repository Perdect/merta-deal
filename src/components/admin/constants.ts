import type { BadgeTone } from "@/components/ui/badge";
import { ORDER_STATUS_META } from "@/lib/order-status";

export const ROLE_OPTIONS = [{ value: "customer", label: "Customer" }, { value: "rider", label: "Rider" }, { value: "admin", label: "Admin" }, { value: "super_admin", label: "Super admin" }];
export const ROLE_TONE: Record<string, BadgeTone> = { customer: "neutral", rider: "saffron", admin: "dark", super_admin: "dark" };

export const STORE_STATUS_TONE: Record<string, BadgeTone> = { pending: "warning", active: "success", suspended: "danger", closed: "neutral" };

export const ORDER_STATUS_OPTIONS = [{ value: "active", label: "All active" }, ...(Object.keys(ORDER_STATUS_META) as (keyof typeof ORDER_STATUS_META)[]).map((k) => ({ value: k, label: ORDER_STATUS_META[k].label }))];
export const PAYMENT_STATUS_OPTIONS = [{ value: "pending", label: "Pending" }, { value: "authorized", label: "Authorized" }, { value: "paid", label: "Paid" }, { value: "failed", label: "Failed" }, { value: "refunded", label: "Refunded" }, { value: "partially_refunded", label: "Partially refunded" }, { value: "cod_pending", label: "COD pending" }, { value: "cod_collected", label: "COD collected" }];
export const PAYMENT_STATUS_TONE: Record<string, BadgeTone> = { pending: "warning", authorized: "info", paid: "success", failed: "danger", refunded: "neutral", partially_refunded: "neutral", cod_pending: "warning", cod_collected: "success" };
export const PAYMENT_METHOD_OPTIONS = [{ value: "cod", label: "Cash on Delivery" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }, { value: "netbanking", label: "Net banking" }, { value: "wallet", label: "Wallet" }, { value: "razorpay", label: "Razorpay" }];
export const PAYMENT_PROVIDER_OPTIONS = [{ value: "cod", label: "COD" }, { value: "razorpay", label: "Razorpay" }, { value: "wallet", label: "Wallet" }];

export const RIDER_STATUS_OPTIONS = [{ value: "pending", label: "Pending" }, { value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }];
export const RIDER_STATUS_TONE: Record<string, BadgeTone> = { pending: "warning", active: "success", suspended: "danger" };
export const VEHICLE_OPTIONS = [{ value: "bicycle", label: "Bicycle" }, { value: "bike", label: "Bike" }, { value: "scooter", label: "Scooter" }, { value: "auto", label: "Auto" }, { value: "van", label: "Van" }];
export const ASSIGNMENT_TONE: Record<string, BadgeTone> = { offered: "warning", accepted: "info", rejected: "danger", expired: "neutral", picked_up: "info", delivered: "success", cancelled: "danger" };

export const TICKET_STATUS_OPTIONS = [{ value: "open_all", label: "Open + in progress" }, { value: "open", label: "Open" }, { value: "in_progress", label: "In progress" }, { value: "resolved", label: "Resolved" }, { value: "closed", label: "Closed" }];
export const TICKET_STATUS_TONE: Record<string, BadgeTone> = { open: "warning", in_progress: "info", resolved: "success", closed: "neutral" };
export const TICKET_PRIORITY_OPTIONS = [{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }];
export const TICKET_PRIORITY_TONE: Record<string, BadgeTone> = { low: "neutral", medium: "info", high: "warning", urgent: "danger" };
export const TICKET_CATEGORY_OPTIONS = [{ value: "order", label: "Order" }, { value: "payment", label: "Payment" }, { value: "delivery", label: "Delivery" }, { value: "refund", label: "Refund" }, { value: "account", label: "Account" }, { value: "general", label: "General" }];

export const PAYOUT_STATUS_OPTIONS = [{ value: "pending", label: "Pending" }, { value: "processing", label: "Processing" }, { value: "paid", label: "Paid" }, { value: "failed", label: "Failed" }];
export const PAYOUT_STATUS_TONE: Record<string, BadgeTone> = { pending: "warning", processing: "info", paid: "success", failed: "danger" };

export const DOC_TYPE_LABEL: Record<string, string> = { gst_certificate: "GST certificate", pan_card: "PAN card", fssai: "FSSAI licence", shop_license: "Shop licence", bank_proof: "Bank proof", owner_id: "Owner ID" };
export const DOC_STATUS_TONE: Record<string, BadgeTone> = { pending: "warning", verified: "success", rejected: "danger" };

export const BANNER_PLACEMENT_OPTIONS = [{ value: "home_hero", label: "Home hero" }, { value: "home_mid", label: "Home middle" }, { value: "category", label: "Category page" }, { value: "checkout", label: "Checkout" }];
export const PROMO_TYPE_OPTIONS = [{ value: "collection", label: "Collection" }, { value: "flash_sale", label: "Flash sale" }, { value: "bogo", label: "Buy one get one" }];
export const WEIGHT_UNIT_OPTIONS = ["g", "kg", "lb", "ml", "l", "pcs", "pack"].map((u) => ({ value: u, label: u === "lb" ? "lb (pound)" : u }));

/** Icon names that DynamicIcon (src/components/shared/dynamic-icon.tsx) can render. Keep in sync. */
export const CATEGORY_ICON_OPTIONS = ["wheat", "flame", "milk", "cookie", "cup-soda", "sparkles", "spray-can", "leafy-green", "baby", "heart", "cooking-pot", "map-pin", "grip", "circle-dot", "bean", "candy", "shaker", "droplet", "leaf", "sprout", "circle", "square", "triangle", "nut", "coffee", "glass-water", "bath", "smile", "scissors", "shirt", "carrot", "apple", "utensils", "package", "basket", "home", "grid", "cart", "store", "tag", "star", "receipt"];
