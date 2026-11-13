"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { lineOptionsText } from "@/lib/cake";
import { Check, Phone, Navigation, Store as StoreIcon, Home, Package, ShieldCheck, Banknote, MessageSquareText, ChevronRight, Map as MapIcon, Clock, Route } from "lucide-react";
import type { RiderAssignment } from "@/types/app";
import { pickupAction, verifyOtpAction, reportFailedDeliveryAction, riderArrivedAction, type OtpResult, type FailedDeliveryReason } from "@/lib/actions/rider";
import { PickupScan } from "./pickup-scan";
import { BottomSheet } from "@/components/ui/overlay";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { cn, formatINR, formatTime } from "@/lib/utils";
import { site } from "@/config/site";
import { useRiderStore, fixToTrackingLocation } from "./rider-store";
import { addressLine, customerOf, formatKm, navigateUrl } from "./rider-utils";
import { UpiQr } from "@/components/shared/upi-qr";
import { useUpiDetails } from "@/hooks/use-upi-details";
import { useT, type TKey } from "@/lib/rider-i18n";

/* The Google Maps library is fetched only when a rider opens the folded map; the home chunk stays small. */
const LiveMap = dynamic(() => import("@/components/shop/live-map").then((m) => m.LiveMap), { ssr: false, loading: () => <div className="mt-2 h-64 animate-pulse rounded-2xl bg-surface-2" aria-busy /> });

/**
 * Four steps mapped onto the backend:
 *   accepted  + not yet at the pickup point  → Go to pickup
 *   accepted  + arrived_pickup_at             → Collect the order   (rider_pickup / scan → picked_up)
 *   picked_up + not yet at the customer       → Go to customer
 *   picked_up + arrived_customer_at           → Complete with OTP   (verify_delivery_otp → delivered)
 * The assignment status is the database's. "Reached" is recorded by rider_mark_arrived and read back from
 * the assignment (0051); until that migration is live the tap is also remembered on this phone.
 */
type Step = "to_pickup" | "collect" | "to_customer" | "otp";
const STEPS: { key: Step; label: TKey; short: TKey; Icon: typeof StoreIcon }[] = [
  { key: "to_pickup", label: "step.toPickup", short: "step.toPickupShort", Icon: StoreIcon },
  { key: "collect", label: "step.collect", short: "step.collectShort", Icon: Package },
  { key: "to_customer", label: "step.toCustomer", short: "step.toCustomerShort", Icon: Home },
  { key: "otp", label: "step.otp", short: "step.otpShort", Icon: ShieldCheck },
];
type Reached = "pickup" | "customer";
const reachedKey = (id: string) => `md_rider_reached:${id}`;
const readReached = (id: string): Reached | null => { try { return (sessionStorage.getItem(reachedKey(id)) as Reached | null) ?? null; } catch { return null; } };
const writeReached = (id: string, r: Reached | null) => { try { if (r) sessionStorage.setItem(reachedKey(id), r); else sessionStorage.removeItem(reachedKey(id)); } catch { /* per-device convenience only */ } };
const subscribeStorage = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };
function useRememberedReached(id: string): Reached | null {
  return React.useSyncExternalStore(subscribeStorage, () => readReached(id), () => null);
}

export type CompletedDelivery = { assignment: RiderAssignment; result: Extract<OtpResult, { ok: true }> };

export function currentStep(a: RiderAssignment, remembered: Reached | null, local: { key: string; reached: Reached } | null): Step {
  if (a.status === "picked_up") {
    const reached = Boolean(a.arrived_customer_at) || remembered === "customer" || (local?.key === `${a.id}:customer` && local.reached === "customer");
    return reached ? "otp" : "to_customer";
  }
  const reached = Boolean(a.arrived_pickup_at) || remembered === "pickup" || (local?.key === `${a.id}:store` && local.reached === "pickup");
  return reached ? "collect" : "to_pickup";
}

export function ActiveDelivery({ assignment: a, onChanged, onCompleted }: { assignment: RiderAssignment; onChanged: () => void; onCompleted: (c: CompletedDelivery) => void }) {
  const { t } = useT();
  const leg = a.status === "picked_up" ? "customer" : "store";
  const remembered = useRememberedReached(a.id);
  const [local, setLocal] = React.useState<{ key: string; reached: Reached } | null>(null);
  const [undone, setUndone] = React.useState<string | null>(null);
  const step = undone === `${a.id}:${leg}` ? (leg === "store" ? "to_pickup" : "to_customer") : currentStep(a, remembered, local);
  const idx = STEPS.findIndex((s) => s.key === step);
  const [verifying, setVerifying] = React.useState(false);

  const reached = async (where: Reached) => {
    writeReached(a.id, where); setUndone(null); setLocal({ key: `${a.id}:${leg}`, reached: where });
    const r = await riderArrivedAction(a.id, where);
    if (!r.ok) toast.warning(t("step.arrivedNotSent"), t("step.arrivedNotSentBody"));
  };
  const notYet = () => { writeReached(a.id, null); setLocal(null); setUndone(`${a.id}:${leg}`); };

  return (
    <section className="overflow-hidden rounded-[20px] border border-line bg-card shadow-card ring-1 ring-brand-200" aria-label={t("active.label")}>
      <header className="bg-brand-50 px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-700">{t("active.label")} · {a.order.order_number}</p>
            <h2 className="mt-0.5 font-display text-[20px] font-extrabold leading-tight text-ink">{t(STEPS[idx].label)}</h2>
          </div>
          {Number(a.earning) > 0 ? <span className="shrink-0 rounded-full bg-card px-3 py-1.5 font-display text-sm font-extrabold tabular text-brand-800 shadow-sm">{formatINR(a.earning)}</span> : null}
        </div>
        <Journey current={idx} />
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-2">
          <span>{t("active.stepOf", { n: idx + 1, total: STEPS.length })}</span>
          {a.order.promised_at ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />{t("active.promisedBy", { time: formatTime(a.order.promised_at) })}</span> : null}
          {a.distance_km != null && Number(a.distance_km) > 0 ? <span className="inline-flex items-center gap-1"><Route className="h-3 w-3" aria-hidden />{formatKm(a.distance_km)}</span> : null}
        </p>
      </header>
      <div className="px-4 pb-4 pt-3">
        {step === "to_pickup" ? <GoToPickup a={a} onReached={() => reached("pickup")} /> : null}
        {step === "collect" ? <Collect a={a} onNotYet={notYet} onChanged={onChanged} /> : null}
        {step === "to_customer" ? <GoToCustomer a={a} onReached={() => reached("customer")} /> : null}
        {step === "otp" ? <CompleteWithOtp a={a} verifying={verifying} setVerifying={setVerifying} onNotYet={notYet} onCompleted={onCompleted} /> : null}
        {!verifying ? <CantDeliver a={a} onReported={onChanged} /> : null}
      </div>
    </section>
  );
}

/** Four icon pills in a row; done ones ticked, the current one solid. */
function Journey({ current }: { current: number }) {
  const { t } = useT();
  return (
    <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label={t("active.stepOf", { n: current + 1, total: STEPS.length })}>
      {STEPS.map((s, i) => {
        const done = i < current; const active = i === current;
        return (
          <li key={s.key} className="min-w-0 text-center">
            <span className={cn("mx-auto flex h-8 w-8 items-center justify-center rounded-full", done ? "bg-brand-600 text-white" : active ? "bg-brand-600 text-white ring-4 ring-brand-200" : "bg-card text-ink-4")} aria-hidden>
              {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <s.Icon className="h-4 w-4" />}
            </span>
            <span className={cn("mt-1 block truncate text-[11px] font-semibold leading-tight", active ? "text-brand-800" : done ? "text-ink-2" : "text-ink-4")}>{t(s.short)}</span>
            <span className="sr-only">{t(s.label)}{done ? ` (${t("common.done")})` : active ? ` (${t("common.current")})` : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

const FAIL_REASONS: { value: FailedDeliveryReason; label: TKey; hint: TKey }[] = [
  { value: "customer_unreachable", label: "fail.unreachable", hint: "fail.unreachableHint" },
  { value: "address_problem", label: "fail.address", hint: "fail.addressHint" },
  { value: "customer_refused", label: "fail.refused", hint: "fail.refusedHint" },
  { value: "other", label: "fail.other", hint: "fail.otherHint" },
];

/** Report a handover that can't happen: the order goes back for re-dispatch and admin decides (retry or cancel). */
function CantDeliver({ a, onReported }: { a: RiderAssignment; onReported: () => void }) {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<FailedDeliveryReason | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const noteNeeded = reason === "other";
  const valid = reason !== null && (!noteNeeded || note.trim().length >= 5);
  const submit = async () => {
    if (!valid || busy || !reason) return;
    setBusy(true); setError(null);
    const r = await reportFailedDeliveryAction(a.id, reason, note);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setOpen(false);
    toast.info(t("fail.reportedTitle"), t("fail.reportedBody", { order: a.order.order_number }));
    onReported();
  };
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setError(null); }} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-md text-sm font-semibold text-ink-3 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">
        {t("fail.link")}
      </button>
      <BottomSheet open={open} onClose={() => (busy ? undefined : setOpen(false))} title={t("fail.title")} description={t("fail.description", { order: a.order.order_number })}
        footer={<Button fullWidth size="lg" variant="danger" loading={busy} disabled={!valid} onClick={submit}>{busy ? t("fail.reporting") : t("fail.submit")}</Button>}>
        <fieldset className="space-y-2">
          <legend className="sr-only">{t("fail.whatWentWrong")}</legend>
          {FAIL_REASONS.map((r) => (
            <label key={r.value} className={cn("flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5", reason === r.value ? "border-brand-600 bg-brand-50" : "border-line-2")}>
              <input type="radio" name="fail-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="mt-1 h-4 w-4 accent-brand-600" />
              <span><span className="block text-sm font-semibold text-ink">{t(r.label)}</span><span className="block text-xs text-ink-3">{t(r.hint)}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="mt-3"><Textarea label={noteNeeded ? t("fail.whatHappened") : t("fail.noteOptional")} required={noteNeeded} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" maxLength={300} placeholder={t("fail.notePlaceholder")} /></div>
        {a.order.payment_method === "cod" ? <p className="mt-2 text-xs text-ink-3">{t("fail.codNote")}</p> : null}
        {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      </BottomSheet>
    </>
  );
}

/** The map stays folded until asked for, so the destination and the two actions lead. */
function FoldedMap({ a, leg }: { a: RiderAssignment; leg: "store" | "customer" }) {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  const fix = useRiderStore((s) => s.gps.fix);
  const customer = customerOf(a);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface text-sm font-semibold text-ink-2 active:scale-[0.99]">
        <MapIcon className="h-4 w-4" aria-hidden />{open ? t("map.hide") : t("map.show")}
      </button>
      {open ? <LiveMap store={{ lat: a.pickup_lat ?? a.pickup.lat, lng: a.pickup_lng ?? a.pickup.lng, name: a.pickup.name }} customer={leg === "customer" ? customer.point : null} rider={fixToTrackingLocation(fix)} trail={[]} showRoute={leg === "customer"} className="mt-2" /> : null}
    </div>
  );
}

const anchorBtn = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-[15px] font-semibold select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600";

/** Call + Navigate: plain anchors (tel: / Google Maps directions deep link, no API key needed). */
function ActionRow({ phone, dest, phoneLabel }: { phone: string | null; dest: { lat: number; lng: number } | null; phoneLabel: string }) {
  const { t } = useT();
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {phone ? <a href={`tel:${phone}`} className={cn(anchorBtn, "bg-surface text-ink ring-1 ring-line")}><Phone className="h-5 w-5" aria-hidden /> {phoneLabel}</a> : <Button variant="outline" size="lg" disabled className="rounded-xl"><Phone className="h-5 w-5" /> {t("action.noNumber")}</Button>}
      {dest ? <a href={navigateUrl(dest.lat, dest.lng)} target="_blank" rel="noreferrer" className={cn(anchorBtn, "bg-info text-white")}><Navigation className="h-5 w-5" aria-hidden /> {t("action.navigate")}</a> : <Button size="lg" disabled className="rounded-xl"><Navigation className="h-5 w-5" /> {t("action.noLocation")}</Button>}
    </div>
  );
}

function Place({ icon, tone, title, line, children }: { icon: React.ReactNode; tone: "brand" | "info"; title: string; line: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", tone === "brand" ? "bg-brand-50 text-brand-700" : "bg-info-50 text-info")}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[16px] font-extrabold text-ink">{title}</p>
        <p className="text-sm text-ink-2">{line}</p>
        {children}
      </div>
    </div>
  );
}

function GoToPickup({ a, onReached }: { a: RiderAssignment; onReached: () => void }) {
  const { t } = useT();
  return (
    <div>
      <Place icon={<StoreIcon className="h-5 w-5" aria-hidden />} tone="brand" title={a.pickup.name} line={[a.pickup.address_line1, a.pickup.area].filter(Boolean).join(", ") || t("pickup.point")}>
        <p className="mt-0.5 text-xs text-ink-3">{a.order.item_count === 1 ? t("pickup.oneItemToCollect") : t("pickup.itemsToCollect", { n: a.order.item_count })}</p>
      </Place>
      <ActionRow phone={a.pickup.phone} dest={{ lat: a.pickup_lat ?? a.pickup.lat, lng: a.pickup_lng ?? a.pickup.lng }} phoneLabel={t("action.callShop")} />
      <FoldedMap a={a} leg="store" />
      <Button size="lg" fullWidth className="mt-3 h-14 rounded-2xl text-base" onClick={onReached}>{t("pickup.reached")} <ChevronRight className="h-5 w-5" /></Button>
    </div>
  );
}

function Collect({ a, onNotYet, onChanged }: { a: RiderAssignment; onNotYet: () => void; onChanged: () => void }) {
  const { t } = useT();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const cod = a.order.payment_method === "cod" && Number(a.cod_amount) > 0;
  const confirm = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const r = await pickupAction(a.id);
      if (!r.ok) { setError(r.error); return; }
      toast.success(t("collect.pickedUp"), t("collect.nowToCustomer"));
      onChanged();
    } catch { setError(t("common.noConnectionRetry")); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-ink-2"><Package className="h-4 w-4 text-ink-3" aria-hidden /> {t("collect.heading", { n: a.order.item_count })} <span className="font-semibold text-ink">{a.order.order_number}</span></div>
      <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl bg-surface">
        {a.items.map((it, i) => (
          <li key={`${it.name}-${i}`} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-card px-1.5 text-xs font-bold tabular text-ink shadow-sm">× {it.quantity}</span>
            <span className="min-w-0 flex-1"><span className="line-clamp-2 font-medium text-ink">{it.name}</span>{it.pack_label ? <span className="text-xs text-ink-3">{it.pack_label}</span> : null}{lineOptionsText(it) ? <span className="block text-xs font-semibold text-saffron-700">{lineOptionsText(it)}</span> : null}</span>
          </li>
        ))}
      </ul>
      <Alert tone={cod ? "warning" : "success"} icon={<Banknote className="h-4 w-4" />} className="mt-3">
        {cod ? t("collect.codNote", { amount: formatINR(a.cod_amount) }) : t("collect.prepaidNote")}
      </Alert>
      {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      <PickupScan a={a} onChanged={onChanged} />
      <Button size="lg" fullWidth className="mt-3 h-14 rounded-2xl text-base" loading={busy} onClick={confirm}><Check className="h-5 w-5" /> {busy ? t("collect.confirming") : t("collect.pickedUpAll")}</Button>
      <button type="button" onClick={onNotYet} className="mt-2 flex min-h-11 w-full items-center justify-center text-sm font-semibold text-ink-3 underline-offset-2 hover:underline">{t("step.notThereYet")}</button>
    </div>
  );
}

function GoToCustomer({ a, onReached }: { a: RiderAssignment; onReached: () => void }) {
  const { t } = useT();
  const c = customerOf(a);
  return (
    <div>
      <Place icon={<Home className="h-5 w-5" aria-hidden />} tone="info" title={c.name} line={addressLine(a.order.address) || t("customer.noAddress")}>
        {a.order.delivery_instructions ? <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-saffron-50 px-2 py-1.5 text-xs text-ink-2"><MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-saffron-700" aria-hidden />{a.order.delivery_instructions}</p> : null}
      </Place>
      <ActionRow phone={c.phone} dest={c.point} phoneLabel={t("action.callCustomer")} />
      <FoldedMap a={a} leg="customer" />
      <Button size="lg" fullWidth className="mt-3 h-14 rounded-2xl text-base" onClick={onReached}>{t("customer.reached")} <ChevronRight className="h-5 w-5" /></Button>
    </div>
  );
}

function CompleteWithOtp({ a, verifying, setVerifying, onNotYet, onCompleted }: { a: RiderAssignment; verifying: boolean; setVerifying: (v: boolean) => void; onNotYet: () => void; onCompleted: (c: CompletedDelivery) => void }) {
  const { t } = useT();
  const [otp, setOtp] = React.useState("");
  const [fail, setFail] = React.useState<{ reason: string; attempts_left?: number; locked?: boolean } | null>(null);
  const [cash, setCash] = React.useState(false);
  const upi = useUpiDetails();
  const [mode, setMode] = React.useState<"cash" | "upi">("cash");
  const byUpi = Boolean(upi) && mode === "upi";
  const [error, setError] = React.useState<string | null>(null);
  const cod = a.order.payment_method === "cod" && Number(a.cod_amount) > 0;
  const c = customerOf(a);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 4 || verifying || (cod && !cash)) return;
    setVerifying(true); setFail(null); setError(null);
    try {
      const r = await verifyOtpAction(a.id, otp, cod && cash && !byUpi, cod && cash && byUpi);
      if (!r.ok) { setError(`${r.error} ${t("otp.retrySafe")}`); return; }
      if (!r.data.ok) { setFail({ reason: r.data.reason, attempts_left: r.data.attempts_left, locked: r.data.locked }); setOtp(""); if ("vibrate" in navigator) navigator.vibrate?.([80, 40, 80]); return; }
      writeReached(a.id, null);
      onCompleted({ assignment: a, result: r.data });
    } catch { setError(t("otp.noConnection")); }
    finally { setVerifying(false); }
  };

  return (
    <form onSubmit={submit}>
      <div className={cn("rounded-2xl p-3", cod ? "bg-saffron-50" : "bg-success-50")}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{cod ? (byUpi ? t("otp.collectByUpi") : t("otp.collectCash")) : t("otp.payment")}</p>
        <p className="font-display text-2xl font-extrabold tabular text-ink">{cod ? formatINR(a.cod_amount) : t("otp.prepaid")}</p>
        <p className="text-xs text-ink-2">{cod ? t("otp.collectBefore", { name: c.name }) : t("otp.nothingToCollect")}</p>
        {cod && upi ? (
          <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={t("otp.howPaying")}>
            {(["cash", "upi"] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} disabled={verifying} onClick={() => { setMode(m); setCash(false); }} className={cn("min-h-11 rounded-xl border text-sm font-semibold", mode === m ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-card text-ink-2")}>{m === "cash" ? t("otp.cash") : "UPI"}</button>)}
          </div>
        ) : null}
        {cod && byUpi && upi ? <div className="mt-3 rounded-xl bg-card p-3"><UpiQr upi={upi} amount={Number(a.cod_amount)} note={a.order.order_number} /></div> : null}
        {cod ? (
          <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-saffron-300 bg-card px-3 py-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} className="h-5 w-5 accent-brand-600" disabled={verifying} />
            {byUpi ? t("otp.sawUpi", { amount: formatINR(a.cod_amount), name: c.name }) : t("otp.collectedCash", { amount: formatINR(a.cod_amount), name: c.name })}
          </label>
        ) : null}
      </div>
      <label htmlFor={`otp-${a.id}`} className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden /> {t("otp.ask", { name: c.name })}</label>
      <Input id={`otp-${a.id}`} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={4} placeholder="••••" aria-label={t("otp.label")}
        className="mt-2 h-16 rounded-2xl text-center font-display text-3xl font-extrabold tracking-[0.5em]" wrapperClassName="mt-0" disabled={verifying || fail?.locked} autoFocus />
      {fail ? <Alert tone="danger" className="mt-3" title={fail.reason}>
        {fail.locked ? <>{t("otp.locked")} <a href={`tel:+${site.supportPhone.replace(/\D/g, "")}`} className="mt-2 inline-flex min-h-11 items-center font-bold underline">{t("otp.callSupport")}</a></>
          : typeof fail.attempts_left === "number" ? t("otp.attemptsLeft", { n: fail.attempts_left }) : null}
      </Alert> : null}
      {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      <Button type="submit" size="lg" fullWidth className="mt-3 h-14 rounded-2xl text-base" loading={verifying} disabled={otp.length !== 4 || (cod && !cash) || Boolean(fail?.locked)}>{verifying ? t("otp.verifying") : t("otp.verify")}</Button>
      <button type="button" onClick={onNotYet} disabled={verifying} className="mt-2 flex min-h-11 w-full items-center justify-center text-sm font-semibold text-ink-3 underline-offset-2 hover:underline disabled:opacity-50">{t("step.notThereYet")}</button>
    </form>
  );
}

/** Shown after a successful OTP check until the rider taps "Back to home". */
export function DeliveryComplete({ completed, onDone }: { completed: CompletedDelivery; onDone: () => void }) {
  const { t } = useT();
  const { assignment: a } = completed;
  const cod = a.order.payment_method === "cod" && Number(a.cod_amount) > 0;
  return (
    <section className="rounded-[20px] border border-line bg-card p-6 text-center shadow-card ring-1 ring-success/30 animate-pop" role="status">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-white"><Check className="h-8 w-8" strokeWidth={3} /></span>
      <h2 className="mt-3 font-display text-xl font-extrabold text-ink">{t("done.title")}</h2>
      <p className="text-sm text-ink-3">{a.order.order_number}</p>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{t("done.addedToEarnings")}</p>
      <p className="font-display text-4xl font-extrabold tabular text-brand-700">{formatINR(a.earning)}</p>
      <p className="text-xs text-ink-3">{t("done.payoutPending")}</p>
      {cod ? <p className="mt-2 text-sm text-ink-2">{t("done.cashCollected", { amount: formatINR(a.cod_amount) })}</p> : null}
      <Button size="lg" fullWidth className="mt-5 h-13 rounded-2xl" onClick={onDone}>{t("done.backHome")}</Button>
    </section>
  );
}
