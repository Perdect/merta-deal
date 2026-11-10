import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrPrecise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,234 (whole rupees) or ₹1,234.50 when paise matter */
export function formatINR(value: number | string | null | undefined, opts: { precise?: boolean } = {}) {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return "₹0";
  if (opts.precise || Math.round(n) !== n) return inrPrecise.format(n);
  return inr.format(n);
}

export function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN").format(Number(value ?? 0));
}

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...opts }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined) {
  return formatDate(value, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatTime(value: string | Date | null | undefined) {
  return formatDate(value, { hour: "numeric", minute: "2-digit", hour12: true });
}

export function timeAgo(value: string | Date | null | undefined) {
  if (!value) return "";
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return formatDate(value);
}

export function minutesUntil(value: string | Date | null | undefined) {
  if (!value) return null;
  return Math.round((new Date(value).getTime() - Date.now()) / 60000);
}

export function discountPct(mrp: number, price: number) {
  if (!mrp || mrp <= 0 || price >= mrp) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

export function slugify(text: string) {
  return text.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function initials(name: string | null | undefined) {
  if (!name) return "MD";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function maskPhone(phone: string | null | undefined) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 2)}XXXXX${d.slice(7)}` : phone;
}

export function isValidIndianMobile(phone: string) {
  return /^[6-9]\d{9}$/.test(phone.replace(/\D/g, "").slice(-10));
}

export function isValidPincode(p: string) {
  return /^[1-9][0-9]{5}$/.test(p);
}

/** Straight-line distance in km (haversine) — labelled as an estimate in the UI. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/** Parses Postgres error text like `MIN_ORDER: Minimum order amount is ₹99` into a friendly message. */
/** Cart limit messages, shared by the server error mapping and the quantity controls. */
export const maxPerOrderMessage = (n: number) => `Maximum ${n} ${n === 1 ? "pack" : "packs"} per order`;
export const onlyAvailableMessage = (n: number) => (n <= 0 ? "Out of stock" : `Only ${n} available`);

export function friendlyError(err: unknown): string {
  const raw = typeof err === "string" ? err : err instanceof Error ? err.message : (err as { message?: string })?.message ?? "Something went wrong";
  // Cart limits (add_to_cart): "MAX_PER_ORDER: 5" / "ONLY_AVAILABLE: 3".
  const limit = raw.match(/^MAX_PER_ORDER:\s*(\d+)/);
  if (limit) return maxPerOrderMessage(Number(limit[1]));
  const avail = raw.match(/^ONLY_AVAILABLE:\s*(\d+)/);
  if (avail) return onlyAvailableMessage(Number(avail[1]));
  const due = raw.match(/^AMOUNT_ABOVE_DUE:\s*([\d.]+)/);
  if (due) return `That's more than the rider holds — at most ₹${Number(due[1]).toFixed(2)} is due.`;
  const notPackable = raw.match(/^NOT_PACKABLE:\s*(\w+)/);
  if (notPackable) return notPackable[1] === "confirmed" ? "Tap Start packing first." : `This order is ${notPackable[1].replace(/_/g, " ")}, so it can't be packed.`;
  if (raw.startsWith("UNIT_NOT_ALLOWED:")) return raw.slice("UNIT_NOT_ALLOWED:".length).trim();
  if (raw.startsWith("BARCODE_IN_USE:")) return `That barcode is already on ${raw.slice("BARCODE_IN_USE:".length).trim()}.`;
  for (const code of ["CAPACITY_FULL", "HANDOVER_SCAN_REQUIRED", "EXCEPTION_PENDING", "INVALID_QUANTITY", "GRN_POSTED", "NO_LINES", "CARTON_SIZE_REQUIRED", "NOT_LISTED", "INVALID_PRICE", "NOTHING_TO_PAY", "REFERENCE_REQUIRED", "INVALID_RULES", "SERVICE_REQUEST", "LISTING", "BUSINESS_INCOMPLETE", "UPI"]) if (raw.startsWith(`${code}:`)) return raw.slice(code.length + 1).trim();
  const below = raw.match(/^BELOW_COST:\s*([\d.]+)/);
  if (below) return `This price is below cost (₹${Number(below[1]).toFixed(2)}).`;
  if (/^BELOW_COST/.test(raw)) return raw.replace(/^BELOW_COST:?\s*/, "Below cost: ");
  if (/^OFFSET_ABOVE_EARNINGS/.test(raw)) return raw.replace(/^OFFSET_ABOVE_EARNINGS:\s*/, "Cash set-off too large: ");
  if (/^GRN_CANCELLED/.test(raw)) return "This receipt was cancelled.";
  if (/^SUPER_ADMIN_REQUIRED/.test(raw)) return "Only a super admin can do that.";
  if (/^INVALID_MODE/.test(raw)) return "Choose how the price should change.";
  if (/^ORDER_CLOSED/.test(raw)) return "This order is already closed.";
  if (/^ORDER_NOT_READY/.test(raw)) return "This order is not packed yet.";
  if (/^CANNOT_CANCEL/.test(raw)) return raw.includes("contact support") ? "This order is already being packed. Please contact support." : "This order can no longer be cancelled.";
  if (/^INVALID_STATE/.test(raw)) return "This delivery has already moved on (refresh to see its current state).";
  // SMS OTP could not be sent (Supabase sms_send_failed). The customer gets a plain line; the provider's text goes to the console for the admin.
  if (/Error sending confirmation OTP|sms_send_failed|verified tester|predefined SMS templates/i.test(raw)) {
    console.warn("sms otp:", raw);
    return /verified tester/i.test(raw) ? "OTP can't be sent to this number yet. Please sign in with your PIN, or try another number." : "We couldn't send the OTP right now. Please try again in a minute or sign in with your PIN.";
  }
  if (raw.startsWith("ITEMS_UNAVAILABLE")) return "Some items in your cart changed (stock or per-order limit). Review your cart and try again.";
  if (/inventory_stock_qty_check|violates check constraint "inventory_stock/i.test(raw)) return "Some items just sold out. Review your cart and try again.";
  const map: Record<string, string> = {
    AUTH_REQUIRED: "Please sign in to continue.",
    CART_EMPTY: "Your cart is empty.",
    ITEM_UNAVAILABLE: "This item is no longer available.",
    OUT_OF_STOCK: "This item is out of stock.",
    CLOSED: "We're closed right now. You can schedule the delivery for later.",
    ADDRESS_NOT_FOUND: "Please select a delivery address.",
    INSUFFICIENT_WALLET: "Your wallet balance is not enough for this order.",
    EXPRESS_UNAVAILABLE: "Express delivery is not available in your area yet.",
    INVALID_SLOT: "Please choose a valid delivery slot.",
    COD_DISABLED: "Cash on Delivery is currently disabled.",
    FORBIDDEN: "You are not allowed to do that.",
    SESSION_EXPIRED: "Your session has expired. Sign in again to continue.",
    INVALID_REASON: "Pick what went wrong.",
    REASON_REQUIRED: "Describe what happened (at least 5 characters).",
    INVALID_AMOUNT: "Enter an amount above zero.",
    ACCOUNT_REQUIRED: "Create a Merta Deal account (mobile number + PIN) before applying. Guest sessions can't apply.",
    OFFER_EXPIRED: "This delivery request has expired.",
    OFFER_TAKEN: "Another rider accepted this delivery first.",
    ALREADY_ON_DELIVERY: "Finish your current delivery before accepting another.",
    RIDER_NOT_ACTIVE: "Your rider account is pending approval.",
    NOT_A_RIDER: "This account is not registered as a delivery partner.",
    PRICE_ABOVE_MRP: "Selling price cannot be higher than MRP.",
    NEGATIVE_STOCK: "Stock cannot go below zero.",
    ORDER_NOT_DELIVERED: "You can review an order after it is delivered.",
    INSUFFICIENT_STOCK: "Some items just sold out. Review your cart and try again.",
    CONFIRMATION_REQUIRED: "Confirm before saving this change.",
    QUANTITY_REQUIRED: "Enter a quantity above zero.",
    QUANTITY_OUT_OF_RANGE: "That quantity is too large. Check the unit and try again.",
    WHOLE_GRAMS_REQUIRED: "Enter a whole number of grams.",
    WHOLE_PACKS_REQUIRED: "Enter a whole number of packs.",
    DIRECTION_REQUIRED: "Choose add or remove.",
    NOT_LISTED: "This product is not listed for sale yet, so it has no stock record. Add it to the store first.",
    NOT_SOLD_BY_WEIGHT: "Only products sold in g or kg can share stock by weight.",
    INVALID_BARCODE: "A barcode is 8 to 14 digits.",
    NOT_ASSIGNED: "This order is not assigned to you.",
    ORDER_NOT_FOUND: "Order not found.",
    ORDER_NOT_PACKED: "This order has not been packed yet.",
    NO_RIDER_ACCEPTED: "No delivery partner has accepted this order yet.",
    ALREADY_ASSIGNED: "A delivery partner is already on this order.",
    PACK_INCOMPLETE: "Scanning shows items still missing. Finish packing in the Scan section.",
  };
  for (const [code, msg] of Object.entries(map)) {
    if (raw.startsWith(code)) return msg;
  }
  // Plain-language versions of common Supabase Auth / network messages.
  const patterns: [RegExp, string][] = [
    [/phone number has already been registered|phone.*already (been )?registered|phone_exists/i, "This mobile number already has a Merta Deal account. Sign in with it, or use a different number."],
    [/email address has already been registered|email.*already (been )?registered|email_exists|user already registered/i, "This email is already linked to another account. Use a different email."],
    [/invalid login credentials/i, "Wrong mobile number or PIN. Check them and try again."],
    [/token has expired or is invalid|otp.*expired|invalid otp/i, "That code is wrong or has expired. Request a new one."],
    [/for security purposes, you can only request this|rate limit|too many requests/i, "Too many attempts. Please wait a minute and try again."],
    [/failed to fetch|fetch failed|network ?error|load failed/i, "You seem to be offline. Check your internet connection and try again."],
    [/password should be at least/i, "Your PIN is too short."],
  ];
  for (const [re, msg] of patterns) if (re.test(raw)) return msg;
  const m = raw.match(/^[A-Z_]+:\s*(.+)$/);
  if (m) return m[1];
  return raw;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function pluralize(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}
