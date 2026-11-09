"use client";
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Phone, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { WhatsAppIcon } from "@/components/shared/whatsapp-icon";
import { submitServiceRequestAction } from "@/lib/actions/service-requests";
import { REQUEST_DESTINATIONS, REQUEST_DESTINATION_LABEL, REQUEST_URGENCIES, URGENCY_LABEL, requestMessage, waHref, type RequestDestination, type RequestKind, type RequestUrgency, type ServiceRequestInput } from "@/lib/service-requests";

const OCCASIONS: Partial<Record<RequestKind, string[]>> = {
  gift_order: ["Birthday", "Anniversary", "Other occasion"],
  sweets_order: ["Family visit", "Festival", "Celebration", "Other"],
  cake_order: ["Birthday", "Anniversary", "Office", "Other"],
  bulk_quote: ["Wedding", "Festival", "Office", "Birthday", "Other"],
};
/** Kinds where a gift message makes sense. */
const GIFTABLE: RequestKind[] = ["gift_order", "sweets_order", "cake_order", "delivery_order", "food_order"];
const COPY: Record<RequestKind, { item: string; itemHint: string; drop: string; dropHint: string }> = {
  gift_order: { item: "What are you looking for?", itemHint: "For example: birthday gift for my sister, around ₹500", drop: "Delivery address", dropHint: "Area, street and landmark" },
  sweets_order: { item: "Which sweets, and how much?", itemHint: "For example: 1 kg mixed sweets", drop: "Delivery address", dropHint: "Area, street and landmark" },
  food_order: { item: "What would you like?", itemHint: "For example: 2 veg thalis", drop: "Delivery address", dropHint: "Area, street and landmark" },
  cake_order: { item: "What cake do you need?", itemHint: "For example: 1 kg chocolate cake, name on top", drop: "Delivery address", dropHint: "Area, street and landmark" },
  delivery_order: { item: "What do you need delivered?", itemHint: "For example: food, sweets, a cake or a gift", drop: "Delivery address", dropHint: "Area, street and landmark" },
  bulk_quote: { item: "What do you need?", itemHint: "For example: sweet boxes, budget ₹200 per box", drop: "Delivery place", dropHint: "Venue, office or area" },
  pickup_drop: { item: "Item type", itemHint: "For example: documents, tiffin, small parcel", drop: "Drop location", dropHint: "Area, street and landmark" },
};
const when = (local: string) => (local ? new Date(local).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : null);

type Outcome = { saved: boolean; reference: string | null; message: string };

/**
 * Public request form. A request is not a booking: the page says so, the team confirms by phone. Saving
 * is honest either way: if the database can't take the request the customer is told and handed the same
 * details as a ready WhatsApp message and a call button.
 */
export function ServiceRequestForm({ kind, title, hindi, submit, whatsapp, tel, phone, destination = "home", context }: { kind: RequestKind; title: string; hindi: string; submit: string; whatsapp: string | null; tel: string; phone: string; destination?: RequestDestination; context?: string }) {
  const bulk = kind === "bulk_quote";
  const c = COPY[kind];
  const [f, setF] = React.useState({ name: "", phone: "", item: "", drop: "", pickup: "", quantity: "", occasion: "", preferred: "", urgency: (bulk ? "scheduled" : "today") as RequestUrgency, notes: "", website: "", destination: destination as RequestDestination, placeName: "", placeDetail: "", recipientName: "", recipientPhone: "", giftMessage: "" });
  const [reception, setReception] = React.useState(false);
  const [forOther, setForOther] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const occasions = OCCASIONS[kind];
  const needsTime = f.urgency !== "asap";
  const showDestination = kind !== "pickup_drop" && kind !== "bulk_quote";
  const isPlace = f.destination === "hotel" || f.destination === "office";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const input: ServiceRequestInput = {
      kind, name: f.name, phone: f.phone.replace(/\D/g, "").slice(-10), item: f.item, drop: f.drop, pickup: f.pickup || undefined, quantity: f.quantity || undefined, occasion: f.occasion || undefined,
      preferredAt: needsTime && f.preferred ? new Date(f.preferred).toISOString() : null, urgency: f.urgency, notes: f.notes || undefined, context,
      ...(showDestination ? {
        destination: f.destination, placeName: isPlace ? f.placeName || undefined : undefined, placeDetail: isPlace ? f.placeDetail || undefined : undefined, viaReception: isPlace && reception,
        recipientName: forOther ? f.recipientName || undefined : undefined, recipientPhone: forOther && f.recipientPhone ? f.recipientPhone.replace(/\D/g, "").slice(-10) : undefined, giftMessage: GIFTABLE.includes(kind) ? f.giftMessage || undefined : undefined,
      } : {}),
    };
    try {
      const r = await submitServiceRequestAction(input, f.website);
      if (!r.ok) { setError(r.error); return; }
      setOutcome({ ...r.data, message: requestMessage(input, needsTime ? when(f.preferred) : null, r.data.reference) });
    } catch {
      setOutcome({ saved: false, reference: null, message: requestMessage(input, needsTime ? when(f.preferred) : null) });
    } finally { setBusy(false); }
  };

  if (outcome) {
    return (
      <div role="status" className="rounded-lg border border-line bg-card p-4 shadow-card">
        {outcome.saved ? (
          <>
            <p className="flex items-center gap-2 font-display text-base font-bold text-ink"><CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />We have your request{outcome.reference ? ` (${outcome.reference})` : ""}</p>
            <p className="mt-1 text-sm text-ink-2">This isn&apos;t a booking yet. We&apos;ll contact you to confirm the details, the time and the charge. If it&apos;s urgent, message or call us as well.</p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 font-display text-base font-bold text-ink"><TriangleAlert className="h-5 w-5 shrink-0 text-warning" aria-hidden />Your request hasn&apos;t reached us yet</p>
            <p className="mt-1 text-sm text-ink-2">We couldn&apos;t save it here. Please send it on WhatsApp or call us. Your details are ready to send.</p>
          </>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {whatsapp ? <a href={waHref(whatsapp, outcome.message)} target="_blank" rel="noopener noreferrer" className="tap inline-flex h-11 items-center gap-2 rounded-lg bg-[#1a7f4b] px-4 text-sm font-semibold text-white hover:bg-[#156a3e]"><WhatsAppIcon className="h-4 w-4" />Send on WhatsApp</a> : null}
          <a href={tel} className="tap inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-semibold text-ink hover:border-brand-300"><Phone className="h-4 w-4" aria-hidden />Call {phone}</a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-card p-4 shadow-card sm:p-6">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      <p lang="hi" className="mt-0.5 text-sm text-ink-3">{hindi}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {kind === "pickup_drop" ? <Input label="Pickup location" required value={f.pickup} onChange={set("pickup")} maxLength={300} hint="Area, street and landmark" autoComplete="off" /> : null}
        {showDestination ? <Select label="Delivering to" required options={REQUEST_DESTINATIONS.map((d) => ({ value: d, label: REQUEST_DESTINATION_LABEL[d] }))} value={f.destination} onChange={set("destination")} /> : null}
        {showDestination && isPlace ? <Input label={f.destination === "hotel" ? "Hotel name" : "Company name"} required value={f.placeName} onChange={set("placeName")} maxLength={120} autoComplete="off" /> : null}
        {showDestination && isPlace ? <Input label={f.destination === "hotel" ? "Room number (optional)" : "Floor or reception instructions (optional)"} value={f.placeDetail} onChange={set("placeDetail")} maxLength={120} autoComplete="off" /> : null}
        <Input label={c.drop} required value={f.drop} onChange={set("drop")} maxLength={300} hint={c.dropHint} autoComplete="off" />
        <Input label={c.item} required value={f.item} onChange={set("item")} maxLength={200} hint={c.itemHint} autoComplete="off" />
        {bulk ? <Input label="Roughly how many?" required value={f.quantity} onChange={set("quantity")} maxLength={100} hint="For example: 150 boxes" autoComplete="off" /> : null}
        {occasions ? <Select label="Occasion" placeholder="Choose one" options={occasions.map((o) => ({ value: o, label: o }))} value={f.occasion} onChange={set("occasion")} /> : null}
        {bulk ? null : <Select label="How soon?" required options={REQUEST_URGENCIES.map((u) => ({ value: u, label: URGENCY_LABEL[u] }))} value={f.urgency} onChange={set("urgency")} />}
        {needsTime ? <Input label={bulk ? "Date and time needed" : "Preferred time"} type="datetime-local" required={f.urgency === "scheduled"} value={f.preferred} onChange={set("preferred")} /> : null}
        <Input label="Your name" required value={f.name} onChange={set("name")} maxLength={80} autoComplete="name" />
        <Input label="Mobile number" type="tel" inputMode="numeric" required value={f.phone} onChange={set("phone")} maxLength={14} autoComplete="tel-national" hint="10 digits. We call this number to confirm." />
        <div className="sm:col-span-2"><Textarea label="Delivery instructions or anything else" rows={2} value={f.notes} onChange={set("notes")} maxLength={1000} /></div>
      </div>
      {showDestination ? (
        <div className="mt-3 space-y-2">
          {isPlace ? <Checkbox label="Hand over at reception" checked={reception} onChange={(e) => setReception(e.target.checked)} /> : null}
          <Checkbox label="This is for someone else" checked={forOther} onChange={(e) => setForOther(e.target.checked)} />
          {forOther ? <div className="grid gap-3 sm:grid-cols-2"><Input label="Receiver's name" required value={f.recipientName} onChange={set("recipientName")} maxLength={80} autoComplete="off" /><Input label="Receiver's mobile number" type="tel" inputMode="numeric" required value={f.recipientPhone} onChange={set("recipientPhone")} maxLength={14} autoComplete="off" /></div> : null}
          {GIFTABLE.includes(kind) ? <Input label="Gift message (optional)" value={f.giftMessage} onChange={set("giftMessage")} maxLength={200} autoComplete="off" /> : null}
        </div>
      ) : null}
      {/* Hidden from people; bots that fill every field reveal themselves here. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label></div>
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p> : null}
      <Button type="submit" loading={busy} fullWidth className="mt-3 sm:w-auto">{submit}</Button>
      <p className="mt-2 text-xs text-ink-3">Sending this form is a request, not a booking. We use your details only to reply. See our <Link href="/privacy" className="font-semibold text-brand-700 hover:underline">Privacy Policy</Link>.</p>
    </form>
  );
}
