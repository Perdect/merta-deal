/** Grams as staff read them: "750 g", "2.5 kg". */
export function formatGrams(grams: number): string {
  const g = Number(grams);
  if (Math.abs(g) < 1000) return `${g.toLocaleString("en-IN")} g`;
  return `${(g / 1000).toLocaleString("en-IN", { maximumFractionDigits: 3 })} kg`;
}

export const formatPacks = (n: number) => `${Number(n).toLocaleString("en-IN")} ${Math.abs(Number(n)) === 1 ? "pack" : "packs"}`;

/** What a quantity works out to, in the base unit stock is held in. Null when it is not a valid entry. */
export function toBaseQuantity(quantity: number, unit: "kg" | "g" | "packs"): { value: number; label: string } | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (unit === "packs") return Number.isInteger(quantity) ? { value: quantity, label: formatPacks(quantity) } : null;
  const grams = unit === "kg" ? quantity * 1000 : quantity;
  const whole = Math.round(grams);
  if (Math.abs(grams - whole) > 1e-6) return null;
  return { value: whole, label: unit === "kg" ? `${quantity} kg (${whole.toLocaleString("en-IN")} g)` : `${whole.toLocaleString("en-IN")} g` };
}

export const REASON_LABEL: Record<string, string> = {
  restock: "Received", wastage: "Wastage / damage", manual_adjust: "Adjusted", order: "Order placed", cancel_restock: "Order cancelled",
  reject_restock: "Order rejected", stock_type_change: "Stock type changed", damage: "Damaged",
};

/** The value a label's QR holds: a real printed barcode where there is one, otherwise a staff-only link. */
export const productQrValue = (p: { barcode: string | null; scan_code: string }, siteUrl: string) => p.barcode ?? `${siteUrl.replace(/\/$/, "")}/q/${p.scan_code}`;
export const orderQrValue = (scanCode: string, siteUrl: string) => `${siteUrl.replace(/\/$/, "")}/q/${scanCode}`;
