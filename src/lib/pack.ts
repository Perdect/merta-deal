import { formatINR } from "./utils";
import { weightLabel } from "./cake";

/**
 * Pack sizes of one product (the `variants` a card carries, see `product_pack_options` in 0033): which
 * size a card stands for, what a size is called, and the per-unit price ("₹98.21/100 g").
 *
 * The per-unit price is the one figure here that is worked out rather than read, so it is shown only
 * when the weight behind it can be trusted. `weight_value` / `weight_unit` alone cannot: a product saved
 * without touching them keeps the form's 1 kg, and the catalogue has sizes labelled "90 g" that still
 * carry it. So the pack label has to state the weight or volume itself ("112 g", "2 L", "4 x 100 g",
 * "112 g × 2", "1 pc (112 g)") and the weight fields have to say the same thing. No label, a label with
 * no measure in it ("1 pc", "Pack of 6"), or a label and fields that disagree: no per-unit price.
 */
type Sized = { pack_label?: string | null; weight_value?: number | string | null; weight_unit?: string | null };
type Stocked = { inventory_id?: string | null; stock_status?: string | null; stock_qty?: number | null };

/** A listed size nobody can add right now. */
export function sizeSoldOut(v: Stocked) { return !v.inventory_id || v.stock_status === "out_of_stock" || (v.stock_qty ?? 0) <= 0; }

/** What a size is called: its pack label, else the weight on the product ("1 Pound", "500 g"). */
export function sizeName(v: Sized) { return v.pack_label?.trim() || weightLabel(v.weight_value ?? "", v.weight_unit ?? "").trim(); }

/** The size a multi-size card shows the price of: the card's own row while it can be added, else the first size that can. */
export function cardSize<T extends Stocked & { id: string }>(productId: string, options: T[]): T {
  return options.find((o) => o.id === productId && !sizeSoldOut(o)) ?? options.find((o) => !sizeSoldOut(o)) ?? options[0];
}

/** A pack's content in grams (weight) or millilitres (volume). */
export type PackMeasure = { kind: "weight" | "volume"; amount: number };

const UNITS: Record<string, [PackMeasure["kind"], number]> = {
  g: ["weight", 1], gm: ["weight", 1], gms: ["weight", 1], gram: ["weight", 1], grams: ["weight", 1],
  kg: ["weight", 1000], kgs: ["weight", 1000],
  ml: ["volume", 1],
  l: ["volume", 1000], lt: ["volume", 1000], ltr: ["volume", 1000], litre: ["volume", 1000], litres: ["volume", 1000], liter: ["volume", 1000], liters: ["volume", 1000],
};
const NUM = "(\\d+(?:\\.\\d+)?)";
const UNIT = "(kgs?|gms?|grams?|g|ml|ltr|lt|litres?|liters?|l)";
// "500 g", "600ml", "15 kg tin"
const ONE = new RegExp(`^${NUM}\\s*${UNIT}(?:\\s+[a-z]+)?$`);
// "4 x 100 g"
const COUNT_FIRST = new RegExp(`^(\\d+)\\s*[x*]\\s*${NUM}\\s*${UNIT}$`);
// "112 g x 2"
const COUNT_LAST = new RegExp(`^${NUM}\\s*${UNIT}\\s*[x*]\\s*(\\d+)$`);
// "1 pc (112 g)"
const ONE_PIECE = new RegExp(`^1\\s*(?:pcs?|piece|pack|packet|unit|bar|bottle|pouch|can|jar|box)\\s*\\(\\s*${NUM}\\s*${UNIT}\\s*\\)$`);

/** The measure a pack label states, as the whole pack and as one piece of it. */
function labelMeasure(label: string): { kind: PackMeasure["kind"]; total: number; each: number } | null {
  const s = label.toLowerCase().replace(/×/g, "x").replace(/\s+/g, " ").trim();
  let count = 1, value = "", unit = "", m: RegExpMatchArray | null;
  if ((m = s.match(ONE)) || (m = s.match(ONE_PIECE))) { value = m[1]; unit = m[2]; }
  else if ((m = s.match(COUNT_FIRST))) { count = Number(m[1]); value = m[2]; unit = m[3]; }
  else if ((m = s.match(COUNT_LAST))) { value = m[1]; unit = m[2]; count = Number(m[3]); }
  else return null;
  const [kind, factor] = UNITS[unit];
  const each = Number(value) * factor;
  if (!(each > 0) || !(count > 0)) return null;
  return { kind, total: each * count, each };
}

const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.5, b * 0.001);

/**
 * What the pack holds, or null when that is not known for sure. The amount is the label's own total;
 * the weight fields must back it up, either as the whole pack ("4 x 100 g" filed as 400 g) or, for a
 * multipack, as one piece of it ("5 x 125 g" filed as 125 g).
 */
export function packMeasure(v: Sized): PackMeasure | null {
  const label = v.pack_label ? labelMeasure(v.pack_label) : null;
  const field = UNITS[(v.weight_unit ?? "").toLowerCase()];
  const value = Number(v.weight_value);
  if (!label || !field || !(value > 0) || field[0] !== label.kind) return null;
  const filed = value * field[1];
  if (!same(filed, label.total) && !same(filed, label.each)) return null;
  return { kind: label.kind, amount: label.total };
}

/**
 * One per-unit price line per size, null where it cannot be worked out. Sizes of one product share a
 * basis so they can be compared down the list: per kg / per L when every measured size is at least
 * that big, otherwise per 100 g / 100 ml.
 */
export function unitPrices(sizes: (Sized & { selling_price?: number | string | null })[]): (string | null)[] {
  const measures = sizes.map(packMeasure);
  const big = (kind: PackMeasure["kind"]) => measures.every((m) => !m || m.kind !== kind || m.amount >= 1000);
  const perBig = { weight: big("weight"), volume: big("volume") };
  return sizes.map((v, i) => {
    const m = measures[i]; const price = Number(v.selling_price);
    if (!m || !(price > 0)) return null;
    const basis = perBig[m.kind] ? 1000 : 100;
    const per = Math.round((price / m.amount) * basis * 100) / 100;
    if (!(per > 0)) return null;
    const unit = m.kind === "weight" ? (basis === 1000 ? "kg" : "100 g") : (basis === 1000 ? "L" : "100 ml");
    return `${formatINR(per)}/${unit}`;
  });
}
