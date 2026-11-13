"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Info, MapPin, Plus, Search, ShoppingBasket, Trash2, Truck } from "lucide-react";
import type { Address } from "@/types/app";
import { ProductImage } from "@/components/shop/product-image";
import { ImageUpload } from "@/components/shared/image-upload";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { QuantityStepper } from "@/components/ui/misc";
import { Alert } from "@/components/ui/states";
import { BottomSheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { AddressWizard } from "@/components/shop/address-wizard";
import { submitWholesaleOrderAction } from "@/lib/actions/wholesale";
import { WHOLESALE_UNITS, type WholesaleCatalogueItem, type WholesaleOrder, type WholesaleSettings } from "@/lib/wholesale";
import { cn, formatINR } from "@/lib/utils";

type Line = { product_id: string; cases: number };
type Requested = { key: string; name: string; brand: string; quantity: string; unit: string; notes: string; photoUrl: string | null };
const DRAFT_KEY = "md-wholesale-draft";
const newRequested = (): Requested => ({ key: Math.random().toString(36).slice(2, 9), name: "", brand: "", quantity: "", unit: "cases", notes: "", photoUrl: null });
const addressLine = (a: Address) => [a.house, a.street, a.area, `${a.city} – ${a.pincode}`].filter(Boolean).join(", ");

/**
 * One bulk order in four blocks: pick cases from the wholesale range, write in anything that is not
 * listed, choose where and when it goes, then send it. Prices shown are only the ones the catalogue
 * really carries; written-in items and products on quote are marked as needing our confirmation and are
 * never given a figure here. Until it is sent the order is a draft on this device only.
 */
export function BulkOrderBuilder({ catalogue, addresses, settings, userId, today, maxDate, defaultName, defaultPhone, defaultAddressId }: {
  catalogue: WholesaleCatalogueItem[]; addresses: Address[]; settings: WholesaleSettings;
  /** Photos are uploaded under this id; storage RLS allows a customer only their own folder. */
  userId: string;
  /** The date window comes from the server so nothing impure is read while rendering. */
  today: string; maxDate: string;
  defaultName: string | null; defaultPhone: string | null; defaultAddressId: string | null;
}) {
  const router = useRouter();
  const [lines, setLines] = React.useState<Line[]>([]);
  const [requested, setRequested] = React.useState<Requested[]>([]);
  const [addressId, setAddressId] = React.useState<string | null>(defaultAddressId ?? addresses[0]?.id ?? null);
  const [saved, setSaved] = React.useState<Address[]>(addresses);
  const [newAddress, setNewAddress] = React.useState(false);
  const [date, setDate] = React.useState(today);
  const [name, setName] = React.useState(defaultName ?? "");
  const [phone, setPhone] = React.useState(defaultPhone ?? "");
  const [notes, setNotes] = React.useState("");
  const [picker, setPicker] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<WholesaleOrder | null>(null);

  const byId = React.useMemo(() => Object.fromEntries(catalogue.map((c) => [c.product_id, c])), [catalogue]);
  const maxRequests = settings.max_request_lines ?? 20;
  const quoteHours = settings.quote_lead_hours ?? 24;

  // A draft lives on this device until it is sent; nothing is saved on the server before that.
  // Restored a tick after mount so the server and the first client render stay identical.
  React.useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const d = JSON.parse(raw) as { lines?: Line[]; requested?: Requested[]; notes?: string };
        if (Array.isArray(d.lines)) setLines(d.lines.filter((l) => byId[l.product_id]));
        if (Array.isArray(d.requested)) setRequested(d.requested);
        if (typeof d.notes === "string") setNotes(d.notes);
      } catch { /* private mode */ }
    }, 0);
    return () => clearTimeout(t);
  }, [byId]);
  React.useEffect(() => {
    try {
      if (lines.length || requested.length) localStorage.setItem(DRAFT_KEY, JSON.stringify({ lines, requested, notes }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch { /* private mode */ }
  }, [lines, requested, notes]);

  const setCases = (p: WholesaleCatalogueItem, v: number) => {
    const cur = lines.find((l) => l.product_id === p.product_id)?.cases ?? 0;
    const next = v <= 0 || (v < p.moq_cases && v < cur) ? 0 : Math.max(v, p.moq_cases);
    setLines((ls) => next === 0 ? ls.filter((l) => l.product_id !== p.product_id)
      : ls.some((l) => l.product_id === p.product_id) ? ls.map((l) => (l.product_id === p.product_id ? { ...l, cases: next } : l)) : [...ls, { product_id: p.product_id, cases: next }]);
  };
  const priced = lines.filter((l) => byId[l.product_id]?.price_per_case != null);
  const onQuote = lines.filter((l) => byId[l.product_id]?.price_per_case == null);
  const subtotal = priced.reduce((a, l) => a + (byId[l.product_id]!.price_per_case ?? 0) * l.cases, 0);
  const filled = requested.filter((r) => r.name.trim().length >= 2);
  const needsQuote = onQuote.length > 0 || filled.length > 0;
  const address = saved.find((a) => a.id === addressId) ?? null;
  const canSend = (lines.length > 0 || filled.length > 0) && Boolean(addressId);

  const send = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await submitWholesaleOrderAction({
      items: lines, addressId, deliveryDate: date, contactName: name, contactPhone: phone, notes,
      requested: filled.map((q) => ({ name: q.name, brand: q.brand, quantity: Number(q.quantity || 0), unit: q.unit, notes: q.notes, photoUrl: q.photoUrl })),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* private mode */ }
    setSent(r.data);
    router.refresh();
  };

  if (sent) {
    const waiting = sent.status === "submitted";
    return (
      <div role="status" className="rounded-2xl border border-line bg-card p-5 shadow-card">
        <p className="flex items-center gap-2 font-display text-lg font-bold text-ink"><CheckCircle2 className="h-6 w-6 shrink-0 text-success" aria-hidden />{waiting ? "Your bulk order is with us" : "Your bulk order is confirmed with us"}</p>
        <p className="mt-1 text-sm text-ink-2">
          {waiting
            ? `We will check stock and prices for the items that need it and send you a quote, usually within ${quoteHours} hour${quoteHours === 1 ? "" : "s"}. Nothing is charged and nothing is packed until you approve it.`
            : "Everything you picked already has a wholesale price. Our team confirms stock and places it; you pay on delivery."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button href="/account/wholesale" className="rounded-xl">Track this order</Button>
          <Button href="/wholesale" variant="outline" className="rounded-xl">Back to wholesale</Button>
        </div>
      </div>
    );
  }

  const results = query.trim().length === 0 ? catalogue : catalogue.filter((c) => `${c.name} ${c.brand_name ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-4 pb-40">
      <Step n={1} title="Pick from the wholesale range" hint="Case size, minimum and price are shown on each product.">
        {lines.length === 0 ? <p className="text-sm text-ink-3">Nothing picked yet.</p> : (
          <ul className="divide-y divide-line">
            {lines.map((l) => { const p = byId[l.product_id]; if (!p) return null; return (
              <li key={l.product_id} className="flex items-center gap-3 py-3">
                <ProductImage image={p.image_url} brand={p.brand_name} productName={p.name} packSize={p.pack_label} className="h-14 w-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-ink">{p.name}</p>
                  <p className="text-xs text-ink-3">Case of {p.case_size}{p.pack_label ? ` × ${p.pack_label}` : ""} · {l.cases * p.case_size} units</p>
                  <p className="text-xs">{p.price_per_case == null ? <span className="font-semibold text-saffron-700">We will quote this</span> : <span className="font-semibold text-ink">{formatINR(p.price_per_case * l.cases)}</span>}</p>
                </div>
                <QuantityStepper value={l.cases} onChange={(v) => setCases(p, v)} min={0} max={Math.min(p.max_cases ?? 99, Math.max(p.in_stock_cases, p.moq_cases))} size="sm" />
              </li>); })}
          </ul>
        )}
        <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => setPicker(true)}><Plus className="h-4 w-4" aria-hidden /> {lines.length ? "Add more products" : "Browse the range"}</Button>
      </Step>

      <Step n={2} title="Can't find what you need?" hint={`Write it in and we will price it. Up to ${maxRequests} items.`}>
        <ul className="space-y-3">
          {requested.map((r, i) => (
            <li key={r.key} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Item {i + 1}</p>
                <button type="button" onClick={() => setRequested((rs) => rs.filter((x) => x.key !== r.key))} className="tap -mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-card" aria-label={`Remove item ${i + 1}`}><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Product name" required value={r.name} maxLength={120} placeholder="Tata Salt 1 kg" autoComplete="off"
                  onChange={(e) => setRequested((rs) => rs.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))} />
                <Input label="Brand (optional)" value={r.brand} maxLength={80} placeholder="Any brand is fine" autoComplete="off"
                  onChange={(e) => setRequested((rs) => rs.map((x) => (x.key === r.key ? { ...x, brand: e.target.value } : x)))} />
                <Input label="How much" required inputMode="decimal" value={r.quantity} maxLength={9} placeholder="10"
                  onChange={(e) => setRequested((rs) => rs.map((x) => (x.key === r.key ? { ...x, quantity: e.target.value.replace(/[^0-9.]/g, "") } : x)))} />
                <Select label="Unit" required value={r.unit} options={WHOLESALE_UNITS.map((u) => ({ value: u, label: u }))}
                  onChange={(e) => setRequested((rs) => rs.map((x) => (x.key === r.key ? { ...x, unit: e.target.value } : x)))} />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_96px]">
                <Textarea label="Pack size or anything else (optional)" rows={2} value={r.notes} maxLength={300} placeholder="Iodised only, 1 kg packs"
                  onChange={(e) => setRequested((rs) => rs.map((x) => (x.key === r.key ? { ...x, notes: e.target.value } : x)))} />
                <div>
                  <p className="mb-1 text-sm font-medium text-ink-2">Photo</p>
                  <ImageUpload bucket="wholesale-photos" folder={userId} value={r.photoUrl} label="Add" aspect="square" maxMb={5}
                    onChange={(url) => setRequested((rs) => rs.map((x) => (x.key === r.key ? { ...x, photoUrl: url } : x)))} />
                </div>
              </div>
            </li>
          ))}
        </ul>
        {requested.length < maxRequests ? (
          <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => setRequested((rs) => [...rs, newRequested()])}><Plus className="h-4 w-4" aria-hidden /> {requested.length ? "Add another item" : "Add an item we don't list"}</Button>
        ) : <p className="mt-2 text-xs text-ink-3">That is the most we can price in one order. Send this one and start another.</p>}
      </Step>

      <Step n={3} title="Where and when" hint="Home, shop, hostel or office — pick any saved address.">
        <fieldset>
          <legend className="sr-only">Delivery address</legend>
          <ul className="space-y-2">
            {saved.map((a) => (
              <li key={a.id}>
                <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", addressId === a.id ? "border-brand-600 bg-brand-50" : "border-line bg-card")}>
                  <input type="radio" name="wholesale-address" className="mt-1 h-4 w-4 accent-[var(--color-brand-600)]" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                  <span className="min-w-0 text-sm">
                    <span className="block font-semibold text-ink">{a.full_name}{a.phone ? ` · ${a.phone}` : ""}</span>
                    <span className="block text-ink-2">{addressLine(a)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <Button variant="outline" size="sm" className="mt-2 rounded-lg" onClick={() => setNewAddress(true)}><MapPin className="h-4 w-4" aria-hidden /> Add a new address</Button>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input label="Delivery date" type="date" required value={date} min={today} max={maxDate} onChange={(e) => setDate(e.target.value)} hint="Any day in the next 30 days." />
          <Input label="Contact person" value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />
          <Input label="Contact mobile" type="tel" inputMode="numeric" value={phone} maxLength={14} autoComplete="tel-national" onChange={(e) => setPhone(e.target.value)} hint="We call this number about the quote." />
          <div className="sm:col-span-2"><Textarea label="Delivery instructions (optional)" rows={2} value={notes} maxLength={500} placeholder="Back gate, ask for Rakesh" onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
      </Step>

      <Step n={4} title="Check and send" hint="A request is not a booking. Nothing is packed or charged until it is confirmed.">
        <dl className="space-y-1.5 text-sm">
          <Row label={`Priced cases (${priced.length})`} value={priced.length ? formatINR(subtotal) : "—"} />
          {onQuote.length ? <Row label={`Products on quote (${onQuote.length})`} value="We will price these" warn /> : null}
          {filled.length ? <Row label={`Items you wrote in (${filled.length})`} value="We will price these" warn /> : null}
          <Row label="Delivery" value={settings.delivery_fee > 0 ? formatINR(settings.delivery_fee) : "Confirmed on the quote"} />
          <Row label="Estimated so far" value={formatINR(subtotal + (settings.delivery_fee || 0))} strong />
        </dl>
        {needsQuote ? (
          <Alert tone="info" icon={<Info className="h-4 w-4" />} className="mt-3">
            This order needs a quote. We confirm stock and price for the marked items and send it back for your approval, usually within {quoteHours} hour{quoteHours === 1 ? "" : "s"}.
          </Alert>
        ) : settings.min_order_amount > 0 && subtotal < settings.min_order_amount ? (
          <Alert tone="warning" className="mt-3">The minimum wholesale order is {formatINR(settings.min_order_amount)}. Add {formatINR(settings.min_order_amount - subtotal)} more.</Alert>
        ) : null}
        {!addressId ? <Alert tone="warning" className="mt-3">Choose a delivery address to continue.</Alert> : null}
        {error ? <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p> : null}
        <p className="mt-3 text-xs text-ink-3">Pay on delivery, by cash or UPI. By sending this you agree to our <Link href="/terms" className="font-semibold text-brand-700 hover:underline">terms</Link>.</p>
      </Step>

      {/* Sticky summary: what is in the order and the one action. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 px-4 py-3 backdrop-blur safe-bottom sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{lines.length + filled.length} item{lines.length + filled.length === 1 ? "" : "s"}{subtotal > 0 ? ` · ${formatINR(subtotal)}` : ""}</p>
            <p className="truncate text-xs text-ink-3">{address ? <><Truck className="mr-1 inline h-3 w-3" aria-hidden />{address.area ?? address.city}</> : "No address chosen"}{needsQuote ? " · quote needed" : ""}</p>
          </div>
          <Button size="lg" className="rounded-xl" disabled={!canSend} loading={busy} onClick={send}>Send bulk order</Button>
        </div>
      </div>

      <BottomSheet open={picker} onClose={() => setPicker(false)} title="Wholesale range">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the range" leftIcon={<Search className="h-4 w-4" />} aria-label="Search the wholesale range" />
        {results.length === 0 ? <p className="py-8 text-center text-sm text-ink-3">Nothing matches. Add it under &ldquo;Can&apos;t find what you need?&rdquo; and we will price it.</p> : (
          <ul className="mt-2 max-h-[55vh] space-y-1 overflow-y-auto">
            {results.map((p) => {
              const cases = lines.find((l) => l.product_id === p.product_id)?.cases ?? 0;
              return (
                <li key={p.product_id} className="flex items-center gap-3 rounded-lg px-1 py-2">
                  <ProductImage image={p.image_url} brand={p.brand_name} productName={p.name} packSize={p.pack_label} className="h-12 w-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold text-ink">{p.name}</p>
                    <p className="text-xs text-ink-3">Case of {p.case_size} · min {p.moq_cases}{p.is_available ? "" : " · not available now"}</p>
                    <p className="text-xs">{p.price_per_case == null ? <span className="font-semibold text-saffron-700">Price on quote</span> : <span className="text-ink-2">{formatINR(p.price_per_case)} / case</span>}</p>
                  </div>
                  {cases > 0 ? <QuantityStepper value={cases} onChange={(v) => setCases(p, v)} min={0} max={p.max_cases ?? 99} size="sm" />
                    : <Button size="sm" variant="outline" className="rounded-lg" disabled={!p.is_available} onClick={() => setCases(p, p.moq_cases)}>Add</Button>}
                </li>
              );
            })}
          </ul>
        )}
      </BottomSheet>

      <BottomSheet open={newAddress} onClose={() => setNewAddress(false)} title="New delivery address">
        <AddressWizard defaultName={name || defaultName} defaultPhone={phone || defaultPhone}
          onSaved={(a) => { setSaved((s) => [a, ...s.filter((x) => x.id !== a.id)]); setAddressId(a.id); setNewAddress(false); toast.success("Address saved"); }}
          onCancel={() => setNewAddress(false)} />
      </BottomSheet>
    </div>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5" aria-labelledby={`step-${n}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{n}</span>
        <div className="min-w-0">
          <h2 id={`step-${n}`} className="font-display text-base font-bold text-ink">{title}</h2>
          <p className="text-xs text-ink-3">{hint}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", strong && "border-t border-line pt-2 text-base font-bold text-ink")}>
      <dt className={cn("text-ink-3", strong && "text-ink")}>{label}</dt>
      <dd className={cn("text-right tabular", warn ? "font-semibold text-saffron-700" : "text-ink")}>{value}</dd>
    </div>
  );
}

/** Small entry card used on the wholesale page. */
export function BulkOrderCta({ className }: { className?: string }) {
  return (
    <Link href="/wholesale/order" className={cn("flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 transition hover:border-brand-300 active:scale-[0.995]", className)}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"><ShoppingBasket className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-base font-bold text-ink">Create a bulk order</span>
        <span className="block text-sm text-ink-2">Pick cases, or write in anything we don&apos;t list and we will quote it.</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-brand-700" aria-hidden />
    </Link>
  );
}
