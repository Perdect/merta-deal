/**
 * Rule-based Hinglish / English order text parser.
 * "Bhai 2 kilo aata aur ek kilo chini bhej do" -> [{ query: "aata", quantity: 2, unit: "kg" }, { query: "chini", quantity: 1, unit: "kg" }]
 * Used as the deterministic fallback for voice ordering, the AI assistant and WhatsApp ordering
 * when ANTHROPIC_API_KEY is not configured. Product matching is done by `search_products` (synonym-aware).
 */
export type ParsedLine = { raw: string; query: string; quantity: number; unit: string | null };

const NUMBER_WORDS: Record<string, number> = {
  ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4, paanch: 5, panch: 5, five: 5, che: 6, chhe: 6, six: 6,
  saat: 7, seven: 7, aath: 8, eight: 8, nau: 9, nine: 9, das: 10, dus: 10, ten: 10, aadha: 0.5, adha: 0.5, half: 0.5, dozen: 12, darjan: 12,
};
const UNIT_WORDS: Record<string, string> = {
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg", g: "g", gm: "g", gram: "g", grams: "g", gms: "g",
  l: "l", ltr: "l", litre: "l", liter: "l", litres: "l", liters: "l", ml: "ml", millilitre: "ml",
  packet: "pack", packets: "pack", pack: "pack", packs: "pack", pkt: "pack", piece: "pcs", pieces: "pcs", pcs: "pcs", pc: "pcs", nag: "pcs",
  bottle: "bottle", bottles: "bottle", dozen: "dozen", darjan: "dozen", box: "box", jar: "jar", bag: "bag",
};
const FILLERS = new Set([
  "bhai", "bhaiya", "bhej", "bhejo", "bhejdo", "do", "dena", "dedo", "de", "chahiye", "chaiye", "please", "pls", "plz", "mujhe", "muje", "ko", "ka", "ki", "ke", "aur", "or", "and",
  "with", "want", "need", "i", "me", "send", "order", "karo", "kar", "hai", "ho", "the", "a", "an", "some", "thoda", "thodi", "sa", "si", "wala", "wali", "vala", "vali", "jaldi", "bhi", "sath",
  "get", "give", "buy", "add", "cart", "mein", "me.", "le", "lo", "aa", "jao", "kripya", "krpya", "ji", "sir", "madam", "hello", "hi", "namaste", "yeh", "ye", "woh", "wo", "bhejna",
]);

function normalize(text: string) {
  return text.toLowerCase().replace(/[,.;!?।]/g, " , ").replace(/\s+/g, " ").trim();
}

export function parseOrderText(text: string): ParsedLine[] {
  if (!text?.trim()) return [];
  const segments = normalize(text).split(/\s*(?:,|\baur\b|\band\b|\bor\b|\bplus\b|\bsath\b|\bsaath\b|\bthen\b|\bfir\b|\bphir\b)\s*/).map((s) => s.trim()).filter(Boolean);
  const lines: ParsedLine[] = [];
  for (const seg of segments) {
    const tokens = seg.split(" ").filter(Boolean);
    let quantity = 1; let unit: string | null = null; const words: string[] = []; let sawNumber = false;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const numMatch = t.match(/^(\d+(?:\.\d+)?)(kg|g|gm|ml|l|ltr|pcs|pc)?$/);
      if (numMatch) { quantity = parseFloat(numMatch[1]); sawNumber = true; if (numMatch[2]) unit = UNIT_WORDS[numMatch[2]] ?? numMatch[2]; continue; }
      if (t in NUMBER_WORDS && !sawNumber) {
        // "do" is ambiguous (=2 vs "give"); only treat as number when followed by a unit or a product word
        if (t === "do" && !(tokens[i + 1] && (tokens[i + 1] in UNIT_WORDS || !FILLERS.has(tokens[i + 1])))) continue;
        quantity = NUMBER_WORDS[t]; sawNumber = true; if (t === "dozen" || t === "darjan") unit = "dozen"; continue;
      }
      if (t in UNIT_WORDS) { unit = UNIT_WORDS[t]; continue; }
      if (FILLERS.has(t)) continue;
      words.push(t);
    }
    const query = words.join(" ").trim();
    if (query.length >= 2) lines.push({ raw: seg, query, quantity, unit });
  }
  return lines;
}

/** Converts a parsed quantity+unit into a suggested pack count given a product pack (e.g. 2 kg of a 1 kg pack => 2). */
export function suggestedPacks(line: ParsedLine, packValue: number | null, packUnit: string | null) {
  if (!line.unit || !packValue || !packUnit) return Math.max(1, Math.round(line.quantity));
  const toBase = (v: number, u: string) => (u === "kg" || u === "l" ? v * 1000 : u === "g" || u === "ml" ? v : null);
  const want = toBase(line.quantity, line.unit);
  const have = toBase(packValue, packUnit);
  if (want == null || have == null || have === 0) return Math.max(1, Math.round(line.quantity));
  return Math.max(1, Math.round(want / have));
}
