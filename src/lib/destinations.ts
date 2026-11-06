/**
 * Where an order goes. Hotel and office details are composed into the address's `house` line, so the
 * rider screen, admin order page, print slip and order history all show them with no special handling.
 * Stored: Office as type "work"; Hotel as type "other" labelled "Hotel".
 */
export const DESTINATIONS = ["home", "office", "hotel", "other"] as const;
export type Destination = (typeof DESTINATIONS)[number];
export const DESTINATION_LABEL: Record<Destination, string> = { home: "Home", office: "Office", hotel: "Hotel", other: "Other" };

const SEP = " · ";
const RECEPTION = "Hand over at reception";

export type PlaceParts = { name: string; detail: string; reception: boolean };

export function composePlace({ name, detail, reception }: PlaceParts) {
  return [name.trim(), detail.trim(), reception ? RECEPTION : ""].filter(Boolean).join(SEP);
}

export function parsePlace(house: string | null | undefined): PlaceParts {
  const parts = (house ?? "").split(SEP);
  const reception = parts[parts.length - 1] === RECEPTION;
  if (reception) parts.pop();
  return { name: parts[0] ?? "", detail: parts.slice(1).join(SEP), reception };
}

export function destinationOf(a: { type?: string | null; label?: string | null }): Destination {
  if (a.type === "work") return "office";
  if (a.type === "other" && a.label === "Hotel") return "hotel";
  return a.type === "other" ? "other" : "home";
}

export function addressFields(d: Destination, customLabel: string) {
  switch (d) {
    case "office": return { type: "work" as const, label: "Office" };
    case "hotel": return { type: "other" as const, label: "Hotel" };
    case "other": return { type: "other" as const, label: customLabel };
    default: return { type: "home" as const, label: "" };
  }
}

/** Delivery instructions plus the gift message, as one note the team and rider can read. */
export function orderNote(instructions: string, gift: string) {
  return [instructions.trim(), gift.trim() ? `Gift message: ${gift.trim()}` : ""].filter(Boolean).join("\n");
}
