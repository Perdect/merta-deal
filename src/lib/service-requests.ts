/** Shared by the public request form, its server action and the admin inbox. No server-only imports. */
export const REQUEST_KINDS = ["gift_order", "sweets_order", "food_order", "cake_order", "delivery_order", "bulk_quote", "pickup_drop"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const REQUEST_URGENCIES = ["asap", "today", "scheduled"] as const;
export type RequestUrgency = (typeof REQUEST_URGENCIES)[number];
export const REQUEST_STATUSES = ["new", "contacted", "confirmed", "completed", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const KIND_LABEL: Record<RequestKind, string> = { gift_order: "Gift order", sweets_order: "Sweets order", food_order: "Food order", cake_order: "Cake order", delivery_order: "Urgent delivery", bulk_quote: "Bulk quotation", pickup_drop: "Pickup and drop" };
export const URGENCY_LABEL: Record<RequestUrgency, string> = { asap: "As soon as possible", today: "Later today", scheduled: "On a date and time" };
export const STATUS_LABEL: Record<RequestStatus, string> = { new: "New", contacted: "Contacted", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" };

export const REQUEST_DESTINATIONS = ["home", "hotel", "office", "other"] as const;
export type RequestDestination = (typeof REQUEST_DESTINATIONS)[number];
export const REQUEST_DESTINATION_LABEL: Record<RequestDestination, string> = { home: "Home", hotel: "Hotel", office: "Office", other: "Other" };

export type ServiceRequestInput = {
  kind: RequestKind; name: string; phone: string; item: string; drop: string; pickup?: string; quantity?: string; occasion?: string;
  /** ISO timestamp, converted from the visitor's local time in the browser. */
  preferredAt?: string | null; urgency: RequestUrgency; notes?: string;
  destination?: RequestDestination; placeName?: string; placeDetail?: string; viaReception?: boolean;
  recipientName?: string; recipientPhone?: string; giftMessage?: string;
  /** Where the request came from, such as the business profile it was sent from. */
  context?: string;
};

/** Digits for a wa.me link, or null when no WhatsApp number is set. */
export function waDigits(whatsapp: unknown) {
  const d = typeof whatsapp === "string" ? whatsapp.replace(/\D/g, "") : "";
  return d.length >= 10 ? (d.length === 10 ? `91${d}` : d) : null;
}
export const waHref = (digits: string, text: string) => `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

/** The request as a readable WhatsApp message, written from the customer's side. */
export function requestMessage(r: ServiceRequestInput, whenText: string | null, reference?: string | null) {
  const lines = [
    `MertaDeal ${KIND_LABEL[r.kind]} request${reference ? ` ${reference}` : ""}`,
    `Name: ${r.name}`, `Phone: ${r.phone}`,
    r.kind === "pickup_drop" ? `Item: ${r.item}` : `Need: ${r.item}`,
    r.quantity ? `Quantity: ${r.quantity}` : null,
    r.occasion ? `Occasion: ${r.occasion}` : null,
    r.context ? `From: ${r.context}` : null,
    r.pickup ? `Pickup: ${r.pickup}` : null,
    `${r.kind === "pickup_drop" ? "Drop" : "Deliver to"}: ${r.destination && r.destination !== "home" ? `${REQUEST_DESTINATION_LABEL[r.destination]}, ` : ""}${[r.placeName, r.placeDetail, r.drop].filter(Boolean).join(", ")}`,
    r.viaReception ? "Hand over at reception" : null,
    r.recipientName ? `Receiver: ${r.recipientName}${r.recipientPhone ? `, ${r.recipientPhone}` : ""}` : null,
    r.giftMessage ? `Gift message: ${r.giftMessage}` : null,
    `When: ${whenText ?? URGENCY_LABEL[r.urgency]}`,
    r.notes ? `Notes: ${r.notes}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}
