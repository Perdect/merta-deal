"use client";
import * as React from "react";
import { Check, Phone, Navigation, Store as StoreIcon, Home, Package, ShieldCheck, Banknote, ChevronLeft, MessageSquareText, ChevronRight } from "lucide-react";
import type { RiderAssignment } from "@/types/app";
import { pickupAction, verifyOtpAction, type OtpResult } from "@/lib/actions/rider";
import { LiveMap } from "@/components/shop/live-map";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { cn, formatINR, formatTime } from "@/lib/utils";
import { site } from "@/config/site";
import { useRiderStore, fixToTrackingLocation } from "./rider-store";
import { addressLine, customerOf, formatKm, navigateUrl } from "./rider-utils";

type StepKey = "accept" | "to_store" | "pickup" | "to_customer" | "deliver" | "otp" | "done";
const STEPS: { key: StepKey; label: string }[] = [
  { key: "accept", label: "Accepted" },
  { key: "to_store", label: "Go to store" },
  { key: "pickup", label: "Pickup" },
  { key: "to_customer", label: "Go to customer" },
  { key: "deliver", label: "Deliver" },
  { key: "otp", label: "OTP verification" },
  { key: "done", label: "Complete" },
];
type SubStep = "to_store" | "pickup" | "to_customer" | "deliver";
const subKey = (id: string) => `md_rider_step:${id}`;
const readSub = (id: string): SubStep | null => { try { return (sessionStorage.getItem(subKey(id)) as SubStep | null) ?? null; } catch { return null; } };
const writeSub = (id: string, s: SubStep) => { try { sessionStorage.setItem(subKey(id), s); } catch { /* per-viewer convenience only */ } };
const subscribeStorage = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };
/** The sub-step remembered on this device — `null` on the server and during hydration, so SSR and client markup match. */
function useRememberedSub(id: string): SubStep | null {
  return React.useSyncExternalStore(subscribeStorage, () => readSub(id), () => null);
}
/** First sub-step for a leg, honouring a "reached store / reached customer" tap remembered on this device. */
function deriveSub(leg: "store" | "customer", saved: SubStep | null): SubStep {
  if (leg === "store") return saved === "pickup" ? "pickup" : "to_store";
  return saved === "deliver" ? "deliver" : "to_customer";
}

export type CompletedDelivery = { assignment: RiderAssignment; result: Extract<OtpResult, { ok: true }> };

/**
 * ACCEPT → GO TO STORE → PICKUP → GO TO CUSTOMER → DELIVER → OTP → COMPLETE.
 * The DB assignment status is the source of truth (accepted = store leg, picked_up = customer leg);
 * the "reached store / reached customer" sub-step is a per-device convenience kept in sessionStorage.
 */
export function ActiveDelivery({ assignment: a, onChanged, onCompleted }: { assignment: RiderAssignment; onChanged: () => void; onCompleted: (c: CompletedDelivery) => void }) {
  const leg: "store" | "customer" = a.status === "picked_up" ? "customer" : "store";
  const legKey = `${a.id}:${leg}`;
  const remembered = useRememberedSub(a.id);
  // The rider's "reached …" tap overrides the derived sub-step only for the same assignment + leg; a status change resets it.
  const [override, setOverride] = React.useState<{ key: string; sub: SubStep } | null>(null);
  const sub: SubStep = override && override.key === legKey ? override.sub : deriveSub(leg, remembered);
  const go = (s: SubStep) => { writeSub(a.id, s); setOverride({ key: legKey, sub: s }); };

  const [verifying, setVerifying] = React.useState(false);
  const currentKey: StepKey = verifying ? "otp" : sub;
  const currentIdx = STEPS.findIndex((s) => s.key === currentKey);

  return (
    <section className="rounded-lg border border-brand-200 bg-card shadow-card" aria-label="Active delivery">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Active delivery · {a.order.order_number}</p>
          <h2 className="truncate text-base font-bold text-ink">{STEPS[currentIdx].label}</h2>
        </div>
        <Badge tone="brand" size="md">{formatINR(a.earning)}</Badge>
      </header>
      <Stepper current={currentIdx} />
      <div className="px-4 pb-4">
        {sub === "to_store" ? <GoToStore a={a} onNext={() => go("pickup")} /> : null}
        {sub === "pickup" ? <Pickup a={a} onBack={() => go("to_store")} onChanged={onChanged} /> : null}
        {sub === "to_customer" ? <GoToCustomer a={a} onNext={() => go("deliver")} /> : null}
        {sub === "deliver" ? <Deliver a={a} verifying={verifying} setVerifying={setVerifying} onBack={() => go("to_customer")} onCompleted={onCompleted} /> : null}
      </div>
    </section>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-1 px-4 py-3" aria-label={`Step ${current + 1} of ${STEPS.length}`}>
      {STEPS.map((s, i) => {
        const done = i < current; const active = i === current;
        return (
          <li key={s.key} className="flex flex-1 items-center last:flex-none">
            <span title={s.label} className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold", done ? "border-brand-600 bg-brand-600 text-white" : active ? "border-brand-600 bg-card text-brand-700 ring-4 ring-brand-100" : "border-line-2 bg-card text-ink-4")}>
              {done ? <Check className="h-3 w-3" /> : i + 1}
              <span className="sr-only">{s.label}{done ? " (done)" : active ? " (current)" : ""}</span>
            </span>
            {i < STEPS.length - 1 ? <span className={cn("mx-0.5 h-0.5 flex-1", done ? "bg-brand-500" : "bg-line-2")} aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function RiderMap({ a, leg }: { a: RiderAssignment; leg: "store" | "customer" }) {
  const fix = useRiderStore((s) => s.gps.fix);
  const customer = customerOf(a);
  return <LiveMap store={{ lat: a.pickup_lat ?? a.store.lat, lng: a.pickup_lng ?? a.store.lng, name: a.store.name }} customer={leg === "customer" ? customer.point : null} rider={fixToTrackingLocation(fix)} trail={[]} showRoute={leg === "customer"} className="mt-3" />;
}

const anchorBtn = "inline-flex h-12 items-center justify-center gap-2 rounded-md px-4 text-base font-semibold select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

/** Call + Navigate: plain anchors (tel: / Google Maps directions deep link, no API key needed). */
function ActionRow({ phone, dest, phoneLabel }: { phone: string | null; dest: { lat: number; lng: number } | null; phoneLabel: string }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {phone ? <a href={`tel:${phone}`} className={cn(anchorBtn, "border border-line-2 bg-card text-ink")}><Phone className="h-5 w-5" /> {phoneLabel}</a> : <Button variant="outline" size="lg" disabled><Phone className="h-5 w-5" /> No number</Button>}
      {dest ? <a href={navigateUrl(dest.lat, dest.lng)} target="_blank" rel="noreferrer" className={cn(anchorBtn, "bg-info text-white")}><Navigation className="h-5 w-5" /> Navigate</a> : <Button size="lg" disabled><Navigation className="h-5 w-5" /> No location</Button>}
    </div>
  );
}

function GoToStore({ a, onNext }: { a: RiderAssignment; onNext: () => void }) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><StoreIcon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-base font-bold text-ink">{a.store.name}</p>
          <p className="text-sm text-ink-2">{a.store.address_line1}, {a.store.area}</p>
          <p className="mt-0.5 text-xs text-ink-3">{a.order.item_count} items · {formatKm(a.distance_km)} total trip{a.order.promised_at ? ` · promised by ${formatTime(a.order.promised_at)}` : ""}</p>
        </div>
      </div>
      <ActionRow phone={a.store.phone} dest={{ lat: a.pickup_lat ?? a.store.lat, lng: a.pickup_lng ?? a.store.lng }} phoneLabel="Call store" />
      <RiderMap a={a} leg="store" />
      <Button size="lg" fullWidth className="mt-3" onClick={onNext}>I&apos;ve reached the store <ChevronRight className="h-5 w-5" /></Button>
    </div>
  );
}

function Pickup({ a, onBack, onChanged }: { a: RiderAssignment; onBack: () => void; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const cod = a.order.payment_method === "cod" && Number(a.cod_amount) > 0;
  const confirm = async () => {
    setBusy(true); setError(null);
    const r = await pickupAction(a.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast.success("Picked up", "Now head to the customer.");
    onChanged();
  };
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-ink-2"><Package className="h-4 w-4 text-ink-3" /> Collect these {a.order.item_count} items for <span className="font-semibold text-ink">{a.order.order_number}</span></div>
      <ul className="mt-2 divide-y divide-line rounded-md border border-line">
        {a.items.map((it, i) => (
          <li key={`${it.name}-${i}`} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="flex h-7 min-w-7 items-center justify-center rounded-sm bg-surface-2 px-1.5 text-xs font-bold tabular text-ink">× {it.quantity}</span>
            <span className="min-w-0 flex-1"><span className="line-clamp-2 font-medium text-ink">{it.name}</span>{it.pack_label ? <span className="text-xs text-ink-3">{it.pack_label}</span> : null}</span>
          </li>
        ))}
      </ul>
      <Alert tone={cod ? "warning" : "success"} icon={<Banknote className="h-4 w-4" />} className="mt-3">
        {cod ? <>Cash on delivery: collect <strong>{formatINR(a.cod_amount)}</strong> from the customer at handover. Don&apos;t pay the store.</> : <>Prepaid order — nothing to collect from the customer.</>}
      </Alert>
      {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="lg" onClick={onBack} aria-label="Back to directions"><ChevronLeft className="h-5 w-5" /></Button>
        <Button size="lg" className="flex-1" loading={busy} onClick={confirm}><Check className="h-5 w-5" /> Picked up all items</Button>
      </div>
    </div>
  );
}

function GoToCustomer({ a, onNext }: { a: RiderAssignment; onNext: () => void }) {
  const c = customerOf(a);
  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-info-50 text-info"><Home className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-base font-bold text-ink">{c.name}</p>
          <p className="text-sm text-ink-2">{addressLine(a.order.address) || "Address not available"}</p>
          {a.order.delivery_instructions ? <p className="mt-1.5 flex items-start gap-1.5 rounded-sm bg-saffron-50 px-2 py-1.5 text-xs text-ink-2"><MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-saffron-700" />{a.order.delivery_instructions}</p> : null}
        </div>
      </div>
      <ActionRow phone={c.phone} dest={c.point} phoneLabel="Call customer" />
      <RiderMap a={a} leg="customer" />
      <Button size="lg" fullWidth className="mt-3" onClick={onNext}>I&apos;ve reached the customer <ChevronRight className="h-5 w-5" /></Button>
    </div>
  );
}

function Deliver({ a, verifying, setVerifying, onBack, onCompleted }: { a: RiderAssignment; verifying: boolean; setVerifying: (v: boolean) => void; onBack: () => void; onCompleted: (c: CompletedDelivery) => void }) {
  const [otp, setOtp] = React.useState("");
  const [fail, setFail] = React.useState<{ reason: string; attempts_left?: number; locked?: boolean } | null>(null);
  const [cash, setCash] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const cod = a.order.payment_method === "cod" && Number(a.cod_amount) > 0;
  const c = customerOf(a);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 4 || verifying || (cod && !cash)) return;
    setVerifying(true); setFail(null); setError(null);
    const r = await verifyOtpAction(a.id, otp, cod && cash);
    setVerifying(false);
    // Network/server error: nothing changed if it failed, and a retry is safe if it went through.
    if (!r.ok) { setError(`${r.error} You can try again — the delivery is never recorded twice.`); return; }
    if (!r.data.ok) { setFail({ reason: r.data.reason, attempts_left: r.data.attempts_left, locked: r.data.locked }); setOtp(""); if ("vibrate" in navigator) navigator.vibrate?.([80, 40, 80]); return; }
    try { sessionStorage.removeItem(subKey(a.id)); } catch { /* ignore */ }
    onCompleted({ assignment: a, result: r.data });
  };

  return (
    <form onSubmit={submit}>
      <div className={cn("rounded-md p-3", cod ? "bg-saffron-50" : "bg-success-50")}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{cod ? "Collect cash" : "Payment"}</p>
        <p className="font-display text-2xl font-extrabold tabular text-ink">{cod ? formatINR(a.cod_amount) : "Prepaid"}</p>
        <p className="text-xs text-ink-2">{cod ? `Collect from ${c.name} before asking for the OTP.` : "Nothing to collect — hand over the order."}</p>
        {cod ? (
          <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-saffron-300 bg-card px-3 py-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} className="h-5 w-5 accent-brand-600" disabled={verifying} />
            I&rsquo;ve collected {formatINR(a.cod_amount)} in cash from {c.name}
          </label>
        ) : null}
      </div>
      <label htmlFor={`otp-${a.id}`} className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-brand-600" /> Ask the customer for their 4-digit delivery OTP</label>
      <Input id={`otp-${a.id}`} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={4} placeholder="••••" aria-label="Delivery OTP"
        className="mt-2 h-16 text-center font-display text-3xl font-extrabold tracking-[0.5em]" wrapperClassName="mt-0" disabled={verifying || fail?.locked} autoFocus />
      {fail ? <Alert tone="danger" className="mt-3" title={fail.reason}>
        {fail.locked ? <>The OTP is locked for this order. Call support — they confirm the handover with the customer and complete it. <a href={`tel:+${site.supportPhone.replace(/\D/g, "")}`} className="mt-2 inline-flex min-h-11 items-center font-bold underline">Call Merta Deal support</a></>
          : typeof fail.attempts_left === "number" ? `${fail.attempts_left} attempt${fail.attempts_left === 1 ? "" : "s"} left. Ask the customer to re-check the OTP in their order.` : null}
      </Alert> : null}
      {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={verifying} aria-label="Back to directions"><ChevronLeft className="h-5 w-5" /></Button>
        <Button type="submit" size="lg" className="flex-1" loading={verifying} disabled={otp.length !== 4 || (cod && !cash) || Boolean(fail?.locked)}>{verifying ? "Verifying OTP…" : "Verify OTP & complete"}</Button>
      </div>
    </form>
  );
}

/** Shown after a successful OTP check until the rider taps "Back to home". */
export function DeliveryComplete({ completed, onDone }: { completed: CompletedDelivery; onDone: () => void }) {
  const { assignment: a } = completed;
  const cod = a.order.payment_method === "cod" && Number(a.cod_amount) > 0;
  return (
    <section className="rounded-lg border border-success/30 bg-card p-5 text-center shadow-card animate-pop" role="status">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-white"><Check className="h-8 w-8" /></span>
      <h2 className="mt-3 font-display text-xl font-extrabold text-ink">Delivered!</h2>
      <p className="text-sm text-ink-3">{a.order.order_number} · {a.store.name}</p>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Added to your earnings</p>
      <p className="font-display text-4xl font-extrabold tabular text-brand-700">{formatINR(a.earning)}</p>
      <p className="text-xs text-ink-3">Payout pending · see Earnings for payout status</p>
      {cod ? <p className="mt-2 text-sm text-ink-2">Cash collected: <strong className="tabular">{formatINR(a.cod_amount)}</strong> — keep it safe for deposit.</p> : null}
      <Button size="lg" fullWidth className="mt-5" onClick={onDone}>Back to home</Button>
    </section>
  );
}
