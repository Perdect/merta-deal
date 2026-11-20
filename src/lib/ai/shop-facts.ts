import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { getPublicSettings, SETTINGS_TAG } from "@/lib/data/catalog";
import { isRazorpayConfigured } from "@/lib/env";
import { upiDetails } from "@/lib/upi";
import { formatINR } from "@/lib/utils";
import { FACT_TOPICS, type FactCard, type FactTopic } from "./assistant-types";
import { numbersIn } from "./assistant-rules";

/**
 * What the assistant is allowed to say about delivery, timings and payment: the public settings and the
 * active delivery zones, which are the same rows the cart and checkout charge from. Each topic becomes a
 * block of sentences written here, by code; a topic whose data is missing has no block, and the assistant
 * then says it does not know. Nothing has a built-in default: no figure appears unless the database holds it.
 */
export type ShopFacts = {
  cards: Partial<Record<FactTopic, FactCard>>;
  /** The same blocks as text, for the model. Topics without data are listed as such. */
  text: string;
  /** Every number that appears in the blocks; a reply quoting any other number is not shown. */
  numbers: Set<string>;
};

export type ShopZone = { name: string; area: string; pincode: string; delivery_fee: number; min_order_amount: number; free_delivery_threshold: number; eta_min_minutes: number; eta_max_minutes: number; express_supported: boolean };

const cachedZones = unstable_cache(async (): Promise<ShopZone[]> => {
  const { data, error } = await createPublicClient().from("delivery_zones")
    .select("name, area, pincode, delivery_fee, min_order_amount, free_delivery_threshold, eta_min_minutes, eta_max_minutes, express_supported")
    .eq("is_active", true).order("name");
  // Thrown, not returned: a failed read must not be cached as "no zones".
  if (error) throw new Error(`delivery zones: ${error.message}`);
  return (data ?? []) as ShopZone[];
}, ["assistant-delivery-zones"], { tags: [SETTINGS_TAG], revalidate: 60 });

const TITLES: Record<FactTopic, string> = {
  delivery_charge: "Delivery charge",
  free_delivery: "Free delivery",
  minimum_order: "Minimum order",
  delivery_time: "Delivery time",
  opening_hours: "Opening hours",
  payment_methods: "Payment methods",
  service_area: "Delivery area",
};

/** A setting as a number, or null when it is absent or not a number. Never a default. */
function num(v: unknown): number | null {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "06:00" → "6:00 am". Null when the value is not a clock time. */
function time12(t: unknown): string | null {
  const m = typeof t === "string" ? /^(\d{1,2}):(\d{2})/.exec(t.trim()) : null;
  if (!m) return null;
  const h = Number(m[1]); const min = m[2];
  if (h > 24 || Number(min) > 59) return null;
  return `${(((h % 24) + 11) % 12) + 1}:${min} ${h % 24 < 12 ? "am" : "pm"}`;
}

const minutes = (a: number, b: number) => (a === b ? `about ${a} minutes` : `about ${Math.min(a, b)}–${Math.max(a, b)} minutes`);
const zoneLabel = (z: ShopZone) => `${z.name} (pincode ${z.pincode})`;

function buildCards(settings: Record<string, unknown> | null, zones: ShopZone[] | null): Partial<Record<FactTopic, FactCard>> {
  const cards: Partial<Record<FactTopic, FactCard>> = {};
  const put = (topic: FactTopic, lines: (string | null | false | undefined)[]) => {
    const kept = lines.filter((l): l is string => Boolean(l));
    if (kept.length) cards[topic] = { topic, title: TITLES[topic], lines: kept };
  };
  const s = settings ?? {};
  const expressZones = (zones ?? []).filter((z) => z.express_supported).map((z) => z.name);

  if (zones?.length) {
    const includedKm = num(s.delivery_included_km); const perKm = num(s.delivery_fee_per_extra_km);
    const expressFee = num(s.express_delivery_fee); const platform = num(s.platform_fee); const tax = num(s.tax_rate_percent);
    put("delivery_charge", [
      ...zones.map((z) => `${zoneLabel(z)}: ${Number(z.delivery_fee) > 0 ? `${formatINR(z.delivery_fee)} delivery charge` : "no delivery charge"}.`),
      includedKm != null && perKm != null && perKm > 0 ? `An address more than ${includedKm} km from our pickup point pays ${formatINR(perKm)} more for each extra km.` : null,
      expressZones.length && expressFee != null && expressFee > 0 ? `Express delivery, where it is offered (${expressZones.join(", ")}), costs ${formatINR(expressFee)} extra.` : null,
      platform != null && platform > 0 ? `A platform fee of ${formatINR(platform)} is added to each order.` : null,
      tax != null && tax > 0 ? `GST of ${tax}% is charged on the delivery and platform fees.` : null,
      "The exact charge for your address is shown in the cart before you pay.",
    ]);
    put("free_delivery", zones.map((z) => (Number(z.free_delivery_threshold) > 0
      ? `${zoneLabel(z)}: standard delivery is free when the items total ${formatINR(z.free_delivery_threshold)} or more.`
      : `${zoneLabel(z)}: standard delivery is free on every order.`)));
    put("minimum_order", zones.map((z) => (Number(z.min_order_amount) > 0
      ? `${zoneLabel(z)}: the items must total at least ${formatINR(z.min_order_amount)}.`
      : `${zoneLabel(z)}: no minimum order.`)));
    const exMin = num(s.express_eta_min_minutes); const exMax = num(s.express_eta_max_minutes);
    const slots = Array.isArray(s.scheduled_slots) ? (s.scheduled_slots as unknown[]).map((slot) => {
      const [from, to] = typeof slot === "string" ? slot.split("-") : [];
      const a = time12(from); const b = time12(to);
      return a && b ? `${a} – ${b}` : null;
    }).filter((x): x is string => Boolean(x)) : [];
    put("delivery_time", [
      ...zones.filter((z) => z.eta_min_minutes > 0 && z.eta_max_minutes > 0).map((z) => `${zoneLabel(z)}: ${minutes(z.eta_min_minutes, z.eta_max_minutes)} after the order is placed.`),
      expressZones.length && exMin != null && exMax != null && exMin > 0 && exMax > 0 ? `Express delivery, where it is offered (${expressZones.join(", ")}): ${minutes(exMin, exMax)}.` : null,
      "These are targets, not guarantees: the time depends on stock, packing, distance and rider availability.",
      slots.length ? `You can also choose a delivery slot at checkout: ${slots.join(", ")}.` : null,
    ]);
    put("service_area", [
      ...zones.map((z) => `${z.name}: ${z.area} — pincode ${z.pincode}.`),
      "Add your address in the app to confirm it is inside the delivery area.",
    ]);
  }

  if (settings && Object.keys(settings).length) {
    const hours = (s.business_hours && typeof s.business_hours === "object" ? s.business_hours : {}) as { open?: unknown; close?: unknown };
    const opens = time12(hours.open); const closes = time12(hours.close);
    put("opening_hours", [
      opens && closes ? `Orders are accepted between ${opens} and ${closes} (IST).` : null,
      s.business_open === false ? "Ordering is switched off at the moment." : null,
    ]);

    // The same switches checkout reads, so the list is what the customer will be offered there.
    const cod = s.cod_enabled !== false;
    const upi = upiDetails(s);
    const gateway = isRazorpayConfigured() && s.online_payments_enabled !== false;
    const methods = [
      cod ? (upi ? "Cash or UPI on delivery (PhonePe, Google Pay, Paytm or any UPI app)." : "Cash on delivery.") : null,
      gateway || upi?.payNow ? "UPI before delivery (PhonePe, Google Pay, Paytm)." : null,
      gateway ? "Credit or debit card." : null,
      gateway ? "Net banking." : null,
    ];
    if (methods.some(Boolean)) put("payment_methods", [...methods, "The options for your order are shown at checkout."]);
  }
  return cards;
}

function factsText(cards: Partial<Record<FactTopic, FactCard>>): string {
  return FACT_TOPICS.map((t) => {
    const c = cards[t];
    return c ? `## ${t}: ${c.title}\n${c.lines.map((l) => `- ${l}`).join("\n")}` : `## ${t}: ${TITLES[t]}\n(no data available: answer_known must be false for this topic)`;
  }).join("\n\n");
}

/** The facts for a given set of rows. Pure: `null` for either input means that data could not be read. */
export function buildShopFacts(settings: Record<string, unknown> | null, zones: ShopZone[] | null): ShopFacts {
  const cards = buildCards(settings, zones);
  return { cards, text: factsText(cards), numbers: new Set(Object.values(cards).flatMap((c) => c.lines.flatMap(numbersIn))) };
}

/** Never throws: when the settings or the zones cannot be read, the topics that need them are simply absent. */
export async function getShopFacts(): Promise<ShopFacts> {
  const [settings, zones] = await Promise.all([
    getPublicSettings().catch((e) => { console.error("assistant/settings", e instanceof Error ? e.message : e); return null; }),
    cachedZones().catch((e) => { console.error("assistant/zones", e instanceof Error ? e.message : e); return null; }),
  ]);
  return buildShopFacts(settings, zones);
}
