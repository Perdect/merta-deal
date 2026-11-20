import type { ShoppingItem, Unit } from "./schemas";

/**
 * Deterministic "starter list" generator used when ANTHROPIC_API_KEY is not configured.
 * It is intentionally simple and transparent: fixed per-person-per-week quantities scaled by
 * household size and duration, plus a few occasion templates (Diwali, Holi, vrat, chai-party) and two
 * dishes (chai, kheer). The lists are only names and quantities: whether the shop has each item, and at
 * what price, is looked up in the catalogue afterwards, and a missing item is shown as missing.
 * The UI labels these results as rule-based so nobody mistakes them for AI output.
 */

export type StarterPlan = { kind: "weekly" | "diwali" | "holi" | "vrat" | "party" | "breakfast" | "cleaning" | "chai" | "kheer"; persons: number; weeks: number; items: ShoppingItem[]; summary: string };

const NUMBER_WORDS: Record<string, number> = { ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4, paanch: 5, panch: 5, five: 5, che: 6, chhe: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8, nau: 9, nine: 9, das: 10, dus: 10, ten: 10 };

const PLANNING_HINTS = /\b(family|parivar|pariwar|ghar|household|week|weekly|hafta|hafte|haftey|saptah|month|monthly|mahina|mahine|mahiney|days?|din|list|plan|planning|ration|saaman|samaan|saman|stock|diwali|deepawali|deepavali|holi|navratri|vrat|fasting|upvas|party|guests?|mehman|breakfast|nashta|cleaning|safai|log|members?|people|persons?|adults?|bachche|bacche|kids?)\b/i;

/**
 * A dish named as something to make ("kheer banana hai", "chai ka saaman"), not as an item to buy
 * ("2 packet chai patti"). Only these two have a fixed list; anything else needs the AI.
 */
const MAKING = "(?:ka |ki |ke )?(?:saaman|samaan|saman|samagri|ingredients?|banan[aie]|banau|banaun|recipe|ke liye)";
const DISHES: { kind: "kheer" | "chai"; re: RegExp }[] = [
  { kind: "kheer", re: new RegExp(`\\b(?:kheer|khir|payasam)\\b[^,.]{0,20}\\b${MAKING}\\b|\\b(?:make|making|cook|recipe for)\\b[^,.]{0,12}\\bkheer\\b`, "i") },
  { kind: "chai", re: new RegExp(`\\b(?:chai|chay|tea)\\b\\s+${MAKING}\\b|\\b(?:make|making)\\b[^,.]{0,12}\\b(?:chai|tea)\\b`, "i") },
];
function dishKind(text: string) {
  return DISHES.find((d) => d.re.test(text))?.kind ?? null;
}

/** Heuristic: does the text ask for a plan/occasion list rather than dictating specific items? */
export function looksLikePlanningRequest(text: string) {
  return PLANNING_HINTS.test(text) || dishKind(text) != null;
}

function detectPersons(text: string, fallback = 4) {
  const t = text.toLowerCase();
  const m = t.match(/(\d{1,2})\s*(?:log|logo|logon|members?|people|persons?|adults?|ka family|ki family|ke family|family)/) ?? t.match(/family of\s*(\d{1,2})/) ?? t.match(/(\d{1,2})\s*(?:ke liye|k liye)/);
  if (m) return clampPersons(parseInt(m[1], 10));
  for (const [w, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${w}\\s*(?:log|logo|logon|members?|people|persons?|adults?)\\b`).test(t)) return clampPersons(n);
  }
  if (/\b(couple|dono|do log)\b/.test(t)) return 2;
  if (/\b(akela|akele|single|bachelor|mere liye|sirf mere)\b/.test(t)) return 1;
  return fallback;
}
const clampPersons = (n: number) => Math.min(20, Math.max(1, Number.isFinite(n) ? n : 4));

function detectWeeks(text: string) {
  const t = text.toLowerCase();
  const num = (s: string | undefined) => (s ? NUMBER_WORDS[s] ?? parseFloat(s) : 1);
  const mMonth = t.match(/(\d+|ek|do|teen)?\s*(month|months|mahina|mahine|mahiney|maheena)\b/);
  if (mMonth) return 4 * Math.max(1, num(mMonth[1]));
  const mDays = t.match(/(\d+)\s*(days?|din)\b/);
  if (mDays) return Math.max(0.5, parseInt(mDays[1], 10) / 7);
  const mWeeks = t.match(/(\d+|ek|do|teen|char)?\s*(week|weeks|hafta|hafte|haftey|saptah)\b/);
  if (mWeeks) return Math.max(1, num(mWeeks[1]));
  if (/\b(fortnight|15 din|pandrah din)\b/.test(t)) return 2;
  return 1;
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;
function scaled(value: number, unit: Unit, persons: number, weeks: number): { quantity: number; unit: Unit } {
  const raw = value * persons * weeks;
  if (unit === "g" && raw >= 1000) return { quantity: roundTo(raw / 1000, 0.5) || 0.5, unit: "kg" };
  if (unit === "ml" && raw >= 1000) return { quantity: roundTo(raw / 1000, 0.5) || 0.5, unit: "l" };
  if (unit === "g" || unit === "ml") return { quantity: roundTo(raw, 50) || 50, unit };
  if (unit === "kg" || unit === "l") return { quantity: roundTo(raw, 0.5) || 0.5, unit };
  return { quantity: Math.max(1, Math.round(raw)), unit };
}
/** Household-level items (not per person): scale by weeks only, at least 1. */
function perHousehold(value: number, unit: Unit, weeks: number): { quantity: number; unit: Unit } {
  return scaled(value, unit, 1, Math.max(1, Math.round(weeks)));
}

type Row = { query: string; perPersonPerWeek?: [number, Unit]; perHousehold?: [number, Unit]; note?: string };

const WEEKLY_ROWS: Row[] = [
  { query: "atta", perPersonPerWeek: [2, "kg"], note: "Chakki atta / Aashirvaad" },
  { query: "rice", perPersonPerWeek: [1, "kg"], note: "Daily rice or basmati" },
  { query: "toor dal", perPersonPerWeek: [300, "g"] },
  { query: "moong dal", perPersonPerWeek: [150, "g"] },
  { query: "chana dal", perPersonPerWeek: [100, "g"] },
  { query: "cooking oil", perPersonPerWeek: [500, "ml"], note: "Fortune / Saffola / mustard oil" },
  { query: "sugar", perPersonPerWeek: [300, "g"] },
  { query: "salt", perHousehold: [1, "pack"], note: "Iodised, 1 kg pack" },
  { query: "milk", perPersonPerWeek: [3.5, "l"], note: "Saras / Amul, buy daily if you prefer fresh" },
  { query: "tea", perHousehold: [250, "g"] },
  { query: "ghee", perHousehold: [250, "g"] },
  { query: "onion", perPersonPerWeek: [1, "kg"] },
  { query: "potato", perPersonPerWeek: [1, "kg"] },
  { query: "tomato", perPersonPerWeek: [500, "g"] },
  { query: "haldi powder", perHousehold: [1, "pack"] },
  { query: "red chilli powder", perHousehold: [1, "pack"], note: "Mathania mirch if available" },
  { query: "dhania powder", perHousehold: [1, "pack"] },
  { query: "jeera", perHousehold: [1, "pack"] },
  { query: "besan", perHousehold: [500, "g"] },
  { query: "poha", perHousehold: [500, "g"] },
  { query: "biscuits", perHousehold: [2, "pack"] },
  { query: "namkeen", perHousehold: [1, "pack"] },
  { query: "detergent", perHousehold: [1, "pack"] },
  { query: "bathing soap", perHousehold: [2, "pcs"] },
  { query: "toothpaste", perHousehold: [1, "pcs"] },
];

const DIWALI_ROWS: Row[] = [
  { query: "soan papdi", perHousehold: [2, "box"], note: "Gifting boxes" },
  { query: "kaju katli", perHousehold: [1, "box"] },
  { query: "besan ladoo", perHousehold: [1, "box"] },
  { query: "bhujia", perHousehold: [2, "pack"], note: "Bikaneri bhujia" },
  { query: "mixture namkeen", perHousehold: [2, "pack"] },
  { query: "kaju", perHousehold: [250, "g"] },
  { query: "badam", perHousehold: [250, "g"] },
  { query: "kishmish", perHousehold: [200, "g"] },
  { query: "ghee", perHousehold: [500, "g"], note: "For diyas and home-made mithai" },
  { query: "besan", perHousehold: [1, "kg"] },
  { query: "sugar", perHousehold: [1, "kg"] },
  { query: "diya", perHousehold: [1, "pack"] },
  { query: "candles", perHousehold: [1, "pack"] },
  { query: "rangoli colour", perHousehold: [1, "pack"] },
  { query: "cold drink", perHousehold: [2, "bottle"] },
];

const HOLI_ROWS: Row[] = [
  { query: "gulal", perHousehold: [4, "pack"], note: "Herbal colours" },
  { query: "gujiya", perHousehold: [1, "box"] },
  { query: "thandai", perHousehold: [1, "bottle"] },
  { query: "papad", perHousehold: [2, "pack"] },
  { query: "namkeen", perHousehold: [3, "pack"] },
  { query: "maida", perHousehold: [1, "kg"] },
  { query: "sugar", perHousehold: [1, "kg"] },
  { query: "ghee", perHousehold: [500, "g"] },
  { query: "milk", perHousehold: [2, "l"] },
  { query: "cold drink", perHousehold: [3, "bottle"] },
];

const VRAT_ROWS: Row[] = [
  { query: "sabudana", perHousehold: [500, "g"] },
  { query: "kuttu atta", perHousehold: [500, "g"] },
  { query: "singhara atta", perHousehold: [500, "g"] },
  { query: "sendha namak", perHousehold: [1, "pack"] },
  { query: "peanuts", perHousehold: [500, "g"] },
  { query: "makhana", perHousehold: [1, "pack"] },
  { query: "ghee", perHousehold: [250, "g"] },
  { query: "potato", perHousehold: [1, "kg"] },
  { query: "milk", perHousehold: [2, "l"] },
  { query: "banana", perHousehold: [1, "dozen"] },
  { query: "apple", perHousehold: [1, "kg"] },
];

const PARTY_ROWS: Row[] = [
  { query: "chips", perPersonPerWeek: [1, "pack"] },
  { query: "namkeen", perHousehold: [2, "pack"] },
  { query: "biscuits", perHousehold: [2, "pack"] },
  { query: "cold drink", perPersonPerWeek: [1, "bottle"] },
  { query: "tea", perHousehold: [250, "g"] },
  { query: "sugar", perHousehold: [500, "g"] },
  { query: "milk", perHousehold: [1, "l"] },
  { query: "paper plates", perHousehold: [1, "pack"] },
  { query: "paper cups", perHousehold: [1, "pack"] },
];

const BREAKFAST_ROWS: Row[] = [
  { query: "poha", perHousehold: [1, "kg"] },
  { query: "suji", perHousehold: [500, "g"] },
  { query: "bread", perHousehold: [2, "pack"] },
  { query: "butter", perHousehold: [100, "g"] },
  { query: "eggs", perHousehold: [1, "dozen"] },
  { query: "milk", perPersonPerWeek: [2, "l"] },
  { query: "tea", perHousehold: [250, "g"] },
  { query: "cornflakes", perHousehold: [1, "pack"] },
  { query: "banana", perHousehold: [1, "dozen"] },
];

const CLEANING_ROWS: Row[] = [
  { query: "detergent", perHousehold: [1, "kg"] },
  { query: "dishwash bar", perHousehold: [2, "pcs"] },
  { query: "floor cleaner", perHousehold: [1, "bottle"] },
  { query: "toilet cleaner", perHousehold: [1, "bottle"] },
  { query: "phenyl", perHousehold: [1, "bottle"] },
  { query: "scrub pad", perHousehold: [2, "pcs"] },
  { query: "garbage bags", perHousehold: [1, "pack"] },
  { query: "bathing soap", perHousehold: [4, "pcs"] },
];

// Dish lists use the per-person column as "per serving" (the week count is fixed at 1).
const CHAI_ROWS: Row[] = [
  { query: "tea", perHousehold: [250, "g"], note: "Chai patti" },
  { query: "sugar", perHousehold: [1, "kg"] },
  { query: "milk", perPersonPerWeek: [150, "ml"] },
  { query: "elaichi", perHousehold: [1, "pack"], note: "Optional" },
  { query: "ginger", perHousehold: [100, "g"], note: "Adrak, optional" },
];

const KHEER_ROWS: Row[] = [
  { query: "milk", perPersonPerWeek: [250, "ml"], note: "Full cream" },
  { query: "rice", perPersonPerWeek: [25, "g"], note: "Basmati or small-grain rice" },
  { query: "sugar", perPersonPerWeek: [50, "g"] },
  { query: "elaichi", perHousehold: [1, "pack"] },
  { query: "kaju", perHousehold: [100, "g"] },
  { query: "kishmish", perHousehold: [100, "g"] },
  { query: "badam", perHousehold: [100, "g"] },
  { query: "kesar", perHousehold: [1, "pack"], note: "Optional" },
];

function build(rows: Row[], persons: number, weeks: number): ShoppingItem[] {
  return rows.map((r) => {
    const q = r.perPersonPerWeek ? scaled(r.perPersonPerWeek[0], r.perPersonPerWeek[1], persons, weeks) : perHousehold(r.perHousehold![0], r.perHousehold![1], weeks);
    return { query: r.query, quantity: q.quantity, unit: q.unit, note: r.note ?? null };
  });
}

export function generateStarterList(text: string): StarterPlan {
  const t = text.toLowerCase();
  const persons = detectPersons(text);
  const weeks = detectWeeks(text);
  const label = `${persons} ${persons === 1 ? "person" : "people"}`;
  if (/\b(diwali|deepawali|deepavali)\b/.test(t)) return { kind: "diwali", persons, weeks: 1, items: build(DIWALI_ROWS, persons, 1), summary: `Diwali starter list — mithai, namkeen, dry fruits and puja items for ${label}.` };
  if (/\bholi\b/.test(t)) return { kind: "holi", persons, weeks: 1, items: build(HOLI_ROWS, persons, 1), summary: `Holi starter list — colours, gujiya and snacks for ${label}.` };
  if (/\b(vrat|fasting|upvas|navratri|ekadashi)\b/.test(t)) return { kind: "vrat", persons, weeks: 1, items: build(VRAT_ROWS, persons, 1), summary: `Vrat / fasting starter list for ${label}.` };
  if (/\b(party|guests?|mehman|get.?together|birthday)\b/.test(t)) return { kind: "party", persons: Math.max(persons, 6), weeks: 1, items: build(PARTY_ROWS, Math.max(persons, 6), 1), summary: `Snacks and drinks starter list for about ${Math.max(persons, 6)} guests.` };
  const dish = dishKind(text);
  if (dish === "kheer") return { kind: "kheer", persons, weeks: 1, items: build(KHEER_ROWS, persons, 1), summary: `Kheer starter list for ${label} — milk, rice, sugar and dry fruits.` };
  if (dish === "chai") return { kind: "chai", persons, weeks: 1, items: build(CHAI_ROWS, persons, 1), summary: `Chai starter list for ${label} — tea, sugar and milk.` };
  if (/\b(breakfast|nashta|nasta)\b/.test(t)) return { kind: "breakfast", persons, weeks, items: build(BREAKFAST_ROWS, persons, weeks), summary: `Breakfast essentials for ${label} for ${weeks === 1 ? "a week" : `${weeks} weeks`}.` };
  if (/\b(cleaning|safai|household cleaning|bathroom)\b/.test(t)) return { kind: "cleaning", persons, weeks, items: build(CLEANING_ROWS, persons, weeks), summary: `Home cleaning starter list.` };
  return { kind: "weekly", persons, weeks, items: build(WEEKLY_ROWS, persons, weeks), summary: `Weekly kirana staples for ${label}${weeks !== 1 ? ` for ${weeks === 4 ? "a month" : `${weeks} weeks`}` : ""} — atta 2 kg/person/week, rice, dal, oil, sugar, milk, sabzi and masale.` };
}
