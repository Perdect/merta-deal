import type { FactTopic } from "./assistant-types";

/**
 * The parts of the assistant that are plain code: recognising a question without the AI, taking contact
 * details out of a message before it leaves the server, and checking that a sentence the model wrote
 * uses only figures it was given. No imports beyond types, so the checks can be run on their own.
 */

/** About the customer's own order, money or account: the assistant cannot see any of it. */
const ACCOUNT_RE = /\b(my|mera|meri|mere|mujhe mera|hamara|hamari)\s+(last\s+|pichh?l[ai]\s+)?(order|orders|refund|payment|paisa|paise|parcel|delivery|wallet|account|address|coupon|otp)\b|\b(refund|return|replace|exchange|cancel|cancellation|complaint|shikayat|order status|order number|track (my|the)? ?order|where is my|kahan hai mera|kaha hai mera|wrong item|galat (item|saaman|saman)|missing item|damaged|kharab|not delivered|nahi (aaya|mila|pahuncha))\b|मेरा ऑर्डर|रिफंड|वापसी|शिकायत/i;

/** "The same as last time": answered from the signed-in customer's own orders, never guessed. */
const REORDER_RE = /\b(re-?order|buy again|order again|same as (last|before)|same order|last time|previous order|past orders?|usual (order|items)|pichh?l[ai] (baar|bar|order|wala|wali)|pehle (jaisa|wala|wali)|dobara (wahi|vahi|same)|phir se (wahi|vahi|same)|wahi (saaman|saman|order) (phir|dobara))\b|पिछली बार|पिछला ऑर्डर|दोबारा वही/i;

const TOPIC_RES: [FactTopic, RegExp][] = [
  ["free_delivery", /\bfree\s+(home\s+)?(delivery|shipping)\b|\bmuft\b|\bdelivery free\b|फ्री डिलीवरी|मुफ्त/i],
  ["delivery_charge", /\b(delivery|dilivery|delievery|shipping|home delivery)\s+(ka\s+|ke\s+|ki\s+)?(charge|charges|fee|fees|cost|paisa|paise|kharcha|rate)\b|\b(charge|charges|fee|fees)\s+(kitn[aei]|kya|for delivery)\b|\bdelivery (kitne|kitna) (ki|ka|me|mein)\b|डिलीवरी चार्ज|डिलीवरी शुल्क/i],
  ["minimum_order", /\b(minimum|min\.?|kam se kam)\s+(order|amount|purchase|cart|kitna)\b|\bminimum\b|न्यूनतम|कम से कम/i],
  ["delivery_time", /\b(delivery|order|saaman|saman|parcel)\s+(time|kitn[ie] der|kitne (time|minute|min|samay)|kab tak)\b|\b(kitn[ie] der|kitne (minute|min|time|samay) (me|mein|lagega|lagenge|lagta)|how (long|fast|soon|quick)|kab tak (aa|pahunch|mil|delivery|deliver)|delivery time|kitni jaldi)\b|कितनी देर|कितने मिनट|कब तक/i],
  ["opening_hours", /\b(timing|timings|opening|closing|open|khula|khuli|khulta|khulti|band|close[sd]?|shop time|working hours|business hours|kitne baje|kab (khul|band)|hours)\b|कितने बजे|समय|खुला|बंद/i],
  ["payment_methods", /\b(payment|pay|cod|cash on delivery|cash|upi|card|net ?banking|paytm|phonepe|phone pe|gpay|google pay|online pay(ment)?)\b|भुगतान|पेमेंट|कैश/i],
  ["service_area", /\b(deliver(y)? (to|in|at|area|karte|hoti|hogi|available)|service area|delivery area|area|areas|pin ?code|kahan tak|kaha tak|kahan kahan|kis area|which areas?|do you deliver|deliver karte|ilaka|ilaake|gaon|village)\b|\b[1-9]\d{5}\b|पिनकोड|इलाका|कहां तक/i],
];

const QUESTION_RE = /\?|\b(kya|kitn[aei]|kab|kahan|kaha|kaise|kaisa|kaun|kis|kyun|how|what|when|where|which|who|why|do you|does|is there|are there|can i|can you|milega|milta|hai kya|hota hai|hoti hai|batao|bataiye|bataye|tell me)\b|क्या|कितन|कब|कहां|कहाँ|कैसे/i;

/** Words that mean "I am listing things to buy", which outweigh a stray question word. */
const BUYING_RE = /\b\d+(\.\d+)?\s*(kg|kilo|g|gm|gram|l|ltr|litre|liter|ml|packet|pack|pcs|piece|dozen|bottle|box)\b|\b(bhej do|bhejdo|bhej dijiye|chahiye|chaiye|add kar|order kar(na|do)|mangwana|mangana)\b/i;

export const isAccountQuestion = (text: string) => ACCOUNT_RE.test(text);
export const isReorderRequest = (text: string) => REORDER_RE.test(text);
export const looksLikeQuestion = (text: string) => QUESTION_RE.test(text) && !BUYING_RE.test(text);

/** Which blocks of shop data a question is about (rule-based mode; with the AI on, the model picks them). */
export function detectTopics(text: string): FactTopic[] {
  return TOPIC_RES.filter(([, re]) => re.test(text)).map(([t]) => t);
}

/**
 * Takes phone numbers and email addresses out of what the customer typed before it is sent to the AI.
 * Quantities, head counts and six-digit pincodes stay: the assistant needs them.
 */
export function maskContact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email removed]")
    .replace(/(?:\+?91[\s-]?|\b0)?[6-9]\d{4}[\s-]?\d{5}\b/g, "[phone removed]");
}

const DEVANAGARI_ZERO = 0x0966;
const asciiDigits = (s: string) => s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - DEVANAGARI_ZERO));

/** Every number written in a text, as plain digit strings: "₹1,299" → "1299", "20–25" → "20", "25", "6:00" → "6", "00". */
export function numbersIn(text: string): string[] {
  const flat = asciiDigits(text).replace(/(\d),(?=\d{2,3}\b)/g, "$1");
  return (flat.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => (n.includes(".") ? String(Number(n)) : n.replace(/^0+(?=\d)/, "")));
}

/** Talk of money or deals. A reply about a shopping list may not contain any: prices are printed beside each product. */
const MONEY_RE = /₹|\brs\.?\s*\d|\binr\b|\brupee|\brupay|\brupaiy|\brupye|रुपय|रुपए|रुपये|%|\bpercent|\bdiscount|\boffers?\b|\bcashback|\bcoupon|\bfree delivery|\bmuft/i;

/** A number that is a price, a share, a time or a distance: "₹25", "10%", "20–25 minute", "6:00 am", "9 baje", "3 km". */
const CLAIM_RE = /(?:₹|\brs\.?|\binr|\brupees?|\brupaye|\brupay)\s*\d[\d,.]*|\d[\d,.:–-]*\s*(?:%|percent\b|rupees?\b|rupaye\b|rupay\b|rs\b|रुपय\S*|रुपए|रुपये|min\b|mins\b|minutes?\b|minat\b|मिनट|ghant[ae]\b|घंट\S*|hours?\b|hrs?\b|baje\b|बजे|am\b|pm\b|km\b|kilomet\S*|किमी)/gi;

/**
 * Whether a sentence written by the model may be shown.
 * - "facts": the answer to a shop question. Every number in it must be one of the shop-data figures.
 * - "list": the line above a shopping list. No money or deals, and no price, time or distance figure at
 *   all (head counts and quantities are fine).
 * - "list+facts": a list that also answers a shop question. Its price, time and distance figures must
 *   be shop-data figures.
 * A figure spelt out in words cannot be caught here; the prompt asks for digits, and the fact blocks
 * printed under the reply, which code writes from the data, are the part that counts.
 */
export function replyIsGrounded(reply: string, facts: Iterable<string>, kind: "facts" | "list" | "list+facts"): boolean {
  const text = asciiDigits(reply);
  const ok = new Set(facts);
  if (kind === "facts") return numbersIn(text).every((n) => ok.has(n));
  const claims = text.match(CLAIM_RE) ?? [];
  if (kind === "list") return !MONEY_RE.test(text) && claims.length === 0;
  return claims.flatMap(numbersIn).every((n) => ok.has(n));
}
