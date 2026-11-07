/** UPI on delivery: payments go straight to the business's UPI ID, with no gateway to confirm them. */
export type UpiDetails = { id: string; name: string };

/** Null until migration 0041 has added the settings, or when the owner switches it off. */
export function upiDetails(settings: Record<string, unknown> | null | undefined): UpiDetails | null {
  const id = typeof settings?.upi_id === "string" ? settings.upi_id.trim() : "";
  const name = typeof settings?.upi_payee_name === "string" ? settings.upi_payee_name.trim() : "";
  return settings?.upi_on_delivery_enabled === true && /^[\w.-]+@[\w.-]+$/.test(id) ? { id, name } : null;
}

/** Standard UPI link: the amount and order number arrive filled in, so payments are easy to match in the bank. */
export function upiLink(d: UpiDetails, amount: number, note: string) {
  const q = [`pa=${d.id}`, `pn=${encodeURIComponent(d.name)}`, `am=${amount.toFixed(2)}`, "cu=INR", `tn=${encodeURIComponent(note)}`];
  return `upi://pay?${q.join("&")}`;
}

/**
 * The same payment opened in a named app. Android resolves upi:// to a chooser; iPhone does not, so
 * each app gets its own scheme. The parameters are identical to the standard link.
 */
export function upiAppLinks(d: UpiDetails, amount: number, note: string) {
  const q = upiLink(d, amount, note).slice("upi://pay?".length);
  return [
    { name: "PhonePe", href: `phonepe://pay?${q}` },
    { name: "Google Pay", href: `tez://upi/pay?${q}` },
    { name: "Paytm", href: `paytmmp://pay?${q}` },
    { name: "Other UPI app", href: `upi://pay?${q}` },
  ];
}
