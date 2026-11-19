/**
 * Made-to-order cake options (0049): an eggless version at a per-unit extra the admin sets, and a
 * short message written on the cake. Both live on the product (what is offered), the cart line and
 * the order line (what was chosen). Weights of cakes are in pounds ("lb").
 */
export const CAKE_MESSAGE_MAX = 40;

export type CakeChoice = { eggless: boolean; message: string };
export type CakeOffer = { eggless_option?: boolean | null; eggless_extra?: number | string | null; cake_message?: boolean | null };

/** What the product offers, with numbers coerced (RPC JSON may carry numerics as strings). */
export function cakeOffer(p: CakeOffer) {
  return { eggless: Boolean(p.eggless_option), extra: Number(p.eggless_extra ?? 0) || 0, message: Boolean(p.cake_message) };
}
/** A product with either option is made to order: it gets the options block, the note and the assurance tiles. */
export function isMadeToOrder(p: CakeOffer) { return Boolean(p.eggless_option || p.cake_message); }

/** Client mirror of _cake_message_clean(): one trimmed line, control characters out, spaces collapsed, cut at the limit. */
export function cleanCakeMessage(s: string) {
  return s.replace(/\s+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trimStart().slice(0, CAKE_MESSAGE_MAX);
}

/** Unit as customers read it: "lb" is shown as "Pound". */
export function unitLabel(unit: string) { return unit === "lb" ? "Pound" : unit; }
export function weightLabel(value: number | string, unit: string) { return `${value} ${unitLabel(unit)}`; }

/** The chosen options of a cart / order line in one short line: "Eggless · Message: “Happy Birthday”". */
export function lineOptionsText(l: { eggless?: boolean | null; cake_message?: string | null }) {
  const parts: string[] = [];
  if (l.eggless) parts.push("Eggless");
  if (l.cake_message) parts.push(`Message on cake: “${l.cake_message}”`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Is this cart or order line a cake? Lines carry neither the category nor the tags, so this goes by what
 * they do carry: a cake option chosen on the line, or the word "cake" in the product name. Used only to
 * decide whether the optional gift-message box is worth showing, so a near miss costs nothing.
 */
export function isCakeLine(l: { name?: string | null; eggless?: boolean | null; cake_message?: string | null }) {
  return Boolean(l.eggless || l.cake_message) || /\bcakes?\b/i.test(l.name ?? "");
}
export function hasCake(lines: { name?: string | null; eggless?: boolean | null; cake_message?: string | null }[]) { return lines.some(isCakeLine); }
