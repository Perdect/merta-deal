"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { lineOptionsText } from "@/lib/cake";
import { Check, Phone, Navigation, Store as StoreIcon, Home, Package, ShieldCheck, Banknote, MessageSquareText, ChevronRight, Map as MapIcon, Clock, Route, WifiOff } from "lucide-react";
import type { RiderAssignment, RiderDeliveryCodeState } from "@/types/app";
import { pickupAction, verifyOtpAction, reportFailedDeliveryAction, riderArrivedAction, resendDeliveryCodeAction, type OtpResult, type OtpFailCode, type FailedDeliveryReason } from "@/lib/actions/rider";
import { createClient } from "@/lib/supabase/client";
import { useNetworkOnline } from "./rider-shell";
import { useNow } from "./use-now";
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
 * Reaching the customer is also when the delivery code goes to the customer by SMS (0059); this app is told
 * how that went and never the code.
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
    <section className="overflow-hidden rounded-[20px] bg-card shadow-card" aria-label={t("active.label")}>
      <header className="bg-surface-2 px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-3">{t("active.label")} · {a.order.order_number}</p>
            <h2 className="mt-0.5 font-display text-[20px] font-extrabold leading-tight text-ink">{t(STEPS[idx].label)}</h2>
          </div>
          {Number(a.earning) > 0 ? <span className="shrink-0 font-display text-[15px] font-extrabold tabular text-brand-700">{formatINR(a.earning)}</span> : null}
        </div>
        <RouteLine a={a} leg={leg} />
        <Journey current={idx} />
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-2">
          <span>{t("active.stepOf", { n: idx + 1, total: STEPS.length })}</span>
          {a.order.promised_at ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />{t("active.promisedBy", { time: formatTime(a.order.promised_at) })}</span> : null}
          {a.distance_km != null && Number(a.distance_km) > 0 ? <span className="inline-flex items-center gap-1"><Route className="h-3 w-3" aria-hidden />{formatKm(a.distance_km)}</span> : null}
          <span className="ml-auto font-semibold text-saffron-700">{t("active.ongoing")}</span>
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
            <span className={cn("mx-auto flex h-8 w-8 items-center justify-center rounded-full", done ? "bg-brand-600 text-white" : active ? "bg-brand-600 text-white ring-4 ring-brand-200" : "bg-card text-ink-4 ring-1 ring-line")} aria-hidden>
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

/** Pick up → Deliver at, joined by a dotted line; the leg the rider is on is in green. */
function RouteLine({ a, leg }: { a: RiderAssignment; leg: "store" | "customer" }) {
  const { t } = useT();
  const pickup = [a.pickup.name, a.pickup.address_line1 ?? a.pickup.area].filter(Boolean).join(", ");
  const drop = addressLine(a.order.address) || customerOf(a).area;
  const rows = [
    { key: "pickup", label: t("active.pickUp"), text: pickup, on: leg === "store", done: leg === "customer" },
    { key: "drop", label: t("active.deliverAt"), text: drop, on: leg === "customer", done: false },
  ];
  return (
    <ol className="mt-3 space-y-0">
      {rows.map((r, i) => (
        <li key={r.key} className="relative flex gap-3 pb-3 last:pb-0">
          <span className="flex w-4 shrink-0 flex-col items-center" aria-hidden>
            <span className={cn("mt-1 h-2.5 w-2.5 rounded-full ring-2", r.on ? "bg-brand-600 ring-brand-200" : r.done ? "bg-brand-600 ring-transparent" : "bg-card ring-brand-600")} />
            {i < rows.length - 1 ? <span className="mt-1 w-0 flex-1 border-l-2 border-dotted border-brand-300" /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-3">{r.label}</span>
            <span className={cn("block truncate text-[13px] font-semibold", r.on ? "text-ink" : "text-ink-2")}>{r.text || "—"}</span>
          </span>
        </li>
      ))}
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

/**
 * What the database recorded about this delivery's code: how the SMS went, the tries left and the resend
 * allowance. Read straight from `rider_delivery_otp_state` (the rider's own assignment only), every few
 * seconds while an SMS is on its way and more slowly after. `state` stays null on a database without 0059,
 * and the step then reads as it did before. The code itself is never part of it.
 */
function useDeliveryCodeState(assignmentId: string) {
  const [got, setGot] = React.useState<{ state: RiderDeliveryCodeState; at: number } | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [unsupported, setUnsupported] = React.useState(false);
  const refresh = React.useCallback(async () => {
    try {
      const { data, error } = await createClient().rpc("rider_delivery_otp_state" as never, { p_assignment_id: assignmentId } as never);
      if (error) { if (error.code === "PGRST202" || error.code === "42883") setUnsupported(true); }
      else if (data) setGot({ state: data as unknown as RiderDeliveryCodeState, at: Date.now() });
    } catch { /* offline: the last answer stays on screen */ }
    finally { setLoaded(true); }
  }, [assignmentId]);
  const sms = got?.state.sms.status ?? null;
  // Quick while something is about to change (the arrival being recorded, an SMS on its way), slow otherwise.
  const settling = !got || sms === "pending" || sms === "queued" || (got.state.applies && !got.state.arrived);
  React.useEffect(() => {
    if (unsupported) return;
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) void refresh(); }, settling ? 3000 : 12000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [refresh, settling, unsupported]);
  const put = React.useCallback((state: RiderDeliveryCodeState) => setGot({ state, at: Date.now() }), []);
  return { state: got?.state ?? null, at: got?.at ?? 0, loaded, refresh, put };
}

const RESEND_REFUSALS: Record<string, TKey> = { OTP_RESEND_LIMIT: "otp.resendNone", OTP_SEND_IN_PROGRESS: "otp.smsSending", OTP_SMS_UNAVAILABLE: "otp.smsNone", OTP_LOCKED: "otp.locked", OTP_NOT_ARRIVED: "otp.notArrived" };

/**
 * How the code reached the customer, as the server recorded it: sent (to the last two digits only), still
 * sending, not sent, or never sent because SMS is not set up. "Sent" appears only when the SMS panel accepted
 * the message. The resend button asks the server for a new SMS; its cooldown and cap are the database's.
 */
function CodeStatus({ a, code, online, disabled }: { a: RiderAssignment; code: ReturnType<typeof useDeliveryCodeState>; online: boolean; disabled: boolean }) {
  const { t } = useT();
  const now = useNow();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const [smsOff, setSmsOff] = React.useState(false);
  const s = code.state;
  if (!s) return code.loaded ? <p className="mt-2 text-xs text-ink-3">{t("otp.fromApp")}</p> : null;

  const sms = s.sms.status;
  const sending = sms === "pending" || sms === "queued";
  const noSms = smsOff || sms === "unavailable" || sms === "no_recipient";
  const wait = Math.max(0, s.resend.retry_in_seconds - Math.floor(((now || code.at) - code.at) / 1000));
  const line = sms === "sent" ? (s.sms.live ? t("otp.smsSent", { tail: s.sms.phone_tail ?? "••" }) : t("otp.smsExpired"))
    : sending ? t("otp.smsSending")
    : sms === "failed" ? t("otp.smsFailed")
    : sms === null ? t("otp.fromApp")
    : t("otp.smsNone");
  const tone = sms === "sent" && s.sms.live ? "success" : sending ? "info" : sms === "failed" || sms === "sent" ? "warning" : "neutral";

  const resend = async () => {
    if (busy || !online) return;
    setBusy(true); setNote(null);
    try {
      const r = await resendDeliveryCodeAction(a.id);
      if (r.ok) {
        if (r.data.state) code.put(r.data.state); else void code.refresh();
        if (r.data.outcome === "sent") setNote({ tone: "success", text: t("otp.resendSent", { tail: r.data.state?.sms.phone_tail ?? "••" }) });
        else setNote({ tone: "warning", text: r.data.outcome === "unavailable" ? t("otp.smsNone") : t("otp.smsFailed") });
      } else {
        const refusal = "code" in r ? r.code : null;
        if (refusal === "OTP_SMS_UNAVAILABLE") setSmsOff(true);
        const secs = "retry_in_seconds" in r && typeof r.retry_in_seconds === "number" ? r.retry_in_seconds : null;
        setNote({ tone: "warning", text: refusal === "OTP_RESEND_WAIT" && secs != null ? t("otp.resendWait", { s: secs }) : refusal && RESEND_REFUSALS[refusal] ? t(RESEND_REFUSALS[refusal]) : r.error });
        void code.refresh();
      }
    } catch { setNote({ tone: "warning", text: t("common.noConnectionRetry") }); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 space-y-2" aria-live="polite">
      <Alert tone={tone} className="rounded-xl">
        {line}
        {s.customer_has_code ? <span className="mt-1 block font-semibold">{t("otp.customerHasCode")}</span> : null}
      </Alert>
      {note ? <Alert tone={note.tone} className="rounded-xl">{note.text}</Alert> : null}
      {!noSms && !s.locked && s.arrived ? (
        s.resend.left > 0 || sms === null ? (
          <div>
            <Button type="button" variant="outline" fullWidth className="min-h-12 rounded-xl" loading={busy} disabled={disabled || busy || !online || sending || wait > 0} onClick={resend}>
              {busy ? t("otp.resending") : wait > 0 ? t("otp.resendIn", { s: wait }) : sms === null ? t("otp.sendSms") : t("otp.resend")}
            </Button>
            {sms !== null ? <p className="mt-1 text-center text-xs text-ink-3">{t("otp.resendsLeft", { n: s.resend.left })}</p> : null}
          </div>
        ) : <p className="text-xs text-ink-3">{t("otp.resendNone")}</p>
      ) : null}
      {!s.locked ? <p className="text-xs font-semibold text-ink-2">{t("otp.triesLeft", { n: s.attempts_left })}</p> : null}
    </div>
  );
}

const FAIL_TITLE: Record<OtpFailCode, TKey> = { OTP_INCORRECT: "otp.wrong", OTP_EXPIRED: "otp.expired", OTP_NOT_ISSUED: "otp.notIssued", OTP_LOCKED: "otp.lockedTitle" };

function CompleteWithOtp({ a, verifying, setVerifying, onNotYet, onCompleted }: { a: RiderAssignment; verifying: boolean; setVerifying: (v: boolean) => void; onNotYet: () => void; onCompleted: (c: CompletedDelivery) => void }) {
  const { t } = useT();
  const [otp, setOtp] = React.useState("");
  const [fail, setFail] = React.useState<{ reason: string; code?: OtpFailCode; attempts_left?: number; locked?: boolean } | null>(null);
  const [cash, setCash] = React.useState(false);
  const upi = useUpiDetails();
  const [mode, setMode] = React.useState<"cash" | "upi">("cash");
  const byUpi = Boolean(upi) && mode === "upi";
  const [error, setError] = React.useState<string | null>(null);
  const cod = a.order.payment_method === "cod" && Number(a.cod_amount) > 0;
  const c = customerOf(a);
  const online = useNetworkOnline();
  const code = useDeliveryCodeState(a.id);
  const locked = Boolean(fail?.locked) || Boolean(code.state?.locked);

  // The "reached" tap could not be recorded (a dropped request): the code is only sent once the server knows,
  // so it is tried again here, once, when the server has twice answered that it has no arrival for this delivery.
  const missing = React.useRef(0);
  const { state: codeState, refresh: refreshCode } = code;
  React.useEffect(() => {
    if (!codeState || codeState.arrived || !codeState.applies || !online) return;
    missing.current += 1;
    if (missing.current !== 2) return;
    void riderArrivedAction(a.id, "customer").then(() => refreshCode(), () => undefined);
  }, [codeState, online, a.id, refreshCode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 4 || verifying || (cod && !cash)) return;
    // Nothing is kept to send later: without a connection the code is simply not checked.
    if (!navigator.onLine) { setError(t("otp.offline")); return; }
    setVerifying(true); setFail(null); setError(null);
    try {
      const r = await verifyOtpAction(a.id, otp, cod && cash && !byUpi, cod && cash && byUpi);
      if (!r.ok) { setError(`${r.error} ${t("otp.retrySafe")}`); return; }
      if (!r.data.ok) { setFail({ reason: r.data.reason, code: r.data.code, attempts_left: r.data.attempts_left, locked: r.data.locked }); setOtp(""); void code.refresh(); if ("vibrate" in navigator) navigator.vibrate?.([80, 40, 80]); return; }
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
      <CodeStatus a={a} code={code} online={online} disabled={verifying} />
      <label htmlFor={`otp-${a.id}`} className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden /> {t("otp.ask", { name: c.name })}</label>
      <p className="mt-0.5 text-xs text-ink-3">{t("otp.onlyCustomer")}</p>
      <Input id={`otp-${a.id}`} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={4} placeholder="••••" aria-label={t("otp.label")}
        className="mt-2 h-16 rounded-2xl text-center font-display text-3xl font-extrabold tracking-[0.5em]" wrapperClassName="mt-0" disabled={verifying || locked} autoFocus />
      {fail ? <Alert tone="danger" className="mt-3" title={fail.code ? t(FAIL_TITLE[fail.code]) : fail.reason}>
        {fail.locked || fail.code === "OTP_LOCKED" ? <>{t("otp.locked")} <a href={`tel:+${site.supportPhone.replace(/\D/g, "")}`} className="mt-2 inline-flex min-h-11 items-center font-bold underline">{t("otp.callSupport")}</a></>
          : fail.code === "OTP_EXPIRED" ? t("otp.expiredBody")
          : fail.code === "OTP_NOT_ISSUED" ? t("otp.notIssuedBody")
          : typeof fail.attempts_left === "number" ? t("otp.attemptsLeft", { n: fail.attempts_left }) : null}
      </Alert> : locked ? <Alert tone="danger" className="mt-3" title={t("otp.lockedTitle")}>{t("otp.locked")} <a href={`tel:+${site.supportPhone.replace(/\D/g, "")}`} className="mt-2 inline-flex min-h-11 items-center font-bold underline">{t("otp.callSupport")}</a></Alert> : null}
      {!online ? <Alert tone="danger" className="mt-3" icon={<WifiOff className="h-4 w-4" />}>{t("otp.offline")}</Alert> : null}
      {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      <Button type="submit" size="lg" fullWidth className="mt-3 h-14 rounded-2xl text-base" loading={verifying} disabled={otp.length !== 4 || (cod && !cash) || locked || !online}>{verifying ? t("otp.verifying") : t("otp.verify")}</Button>
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
    <section className="rounded-[20px] bg-card p-6 text-center shadow-card ring-1 ring-success/30 animate-pop" role="status">
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
