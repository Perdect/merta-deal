"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { lineOptionsText } from "@/lib/cake";
import { Check, Phone, Navigation, Store as StoreIcon, Home, ShieldCheck, Banknote, MessageSquareText, ChevronRight, Map as MapIcon, Clock, WifiOff, IndianRupee } from "lucide-react";
import type { RiderAssignment, RiderDeliveryCodeState } from "@/types/app";
import { pickupAction, verifyOtpAction, reportFailedDeliveryAction, riderArrivedAction, resendDeliveryCodeAction, type OtpResult, type OtpFailCode, type FailedDeliveryReason } from "@/lib/actions/rider";
import { createClient } from "@/lib/supabase/client";
import { useNetworkOnline } from "./rider-shell";
import { useNow } from "./use-now";
import { PickupScan } from "./pickup-scan";
import { BottomSheet } from "@/components/ui/overlay";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { cn, formatINR, formatTime } from "@/lib/utils";
import { site } from "@/config/site";
import { useRiderStore, fixToTrackingLocation } from "./rider-store";
import { addressLines, customerOf, navigateUrl } from "./rider-utils";
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
const STEPS: { key: Step; label: TKey }[] = [
  { key: "to_pickup", label: "step.toPickup" },
  { key: "collect", label: "step.collect" },
  { key: "to_customer", label: "step.toCustomer" },
  { key: "otp", label: "step.otp" },
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
type CodeFail = { reason: string; code?: OtpFailCode; attempts_left?: number; locked?: boolean };
/**
 * Development preview only (`/dev-preview/rider`): a fixed answer for the delivery-code state and for the last
 * check, so the code step can be drawn in each of its states without a real delivery. With it nothing is sent.
 */
export type ActiveDeliveryDemo = { code?: RiderDeliveryCodeState | null; fail?: CodeFail | null };

export function currentStep(a: RiderAssignment, remembered: Reached | null, local: { key: string; reached: Reached } | null): Step {
  if (a.status === "picked_up") {
    const reached = Boolean(a.arrived_customer_at) || remembered === "customer" || (local?.key === `${a.id}:customer` && local.reached === "customer");
    return reached ? "otp" : "to_customer";
  }
  const reached = Boolean(a.arrived_pickup_at) || remembered === "pickup" || (local?.key === `${a.id}:store` && local.reached === "pickup");
  return reached ? "collect" : "to_pickup";
}

/**
 * The one delivery the rider is on: which step it is ("Step 2 of 4") in plain words, what to do, and one
 * large button for the next step. Navigate and Call are the two secondary buttons; "Can't complete this
 * delivery?" stays at the bottom, quiet.
 */
export function ActiveDelivery({ assignment: a, onChanged, onCompleted, demo }: { assignment: RiderAssignment; onChanged: () => void; onCompleted: (c: CompletedDelivery) => void; demo?: ActiveDeliveryDemo }) {
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
    if (demo) return;
    const r = await riderArrivedAction(a.id, where);
    if (!r.ok) toast.warning(t("step.arrivedNotSent"), t("step.arrivedNotSentBody"));
  };
  const notYet = () => { writeReached(a.id, null); setLocal(null); setUndone(`${a.id}:${leg}`); };

  return (
    <section className="overflow-hidden rounded-[24px] bg-card shadow-card ring-1 ring-line" aria-label={t("active.label")}>
      <header className="px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1.5 text-[14px] font-bold leading-none text-brand-800">{t("active.stepOf", { n: idx + 1, total: STEPS.length })}</span>
          <span className="min-w-0 truncate text-[14px] font-semibold text-ink-3">{t("req.order", { number: a.order.order_number })}</span>
        </div>
        <h2 className="mt-2.5 font-display text-[26px] font-extrabold leading-tight text-ink">{t(STEPS[idx].label)}</h2>
        <Journey current={idx} />
        {a.order.promised_at || Number(a.earning) > 0 ? (
          <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-ink-2">
            {a.order.promised_at ? <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-ink-3" aria-hidden />{t("active.promisedBy", { time: formatTime(a.order.promised_at) })}</span> : null}
            {Number(a.earning) > 0 ? <span className="inline-flex items-center gap-1 font-semibold text-brand-800"><IndianRupee className="h-4 w-4" aria-hidden />{t("req.youEarn", { amount: formatINR(a.earning) })}</span> : null}
          </p>
        ) : null}
      </header>
      <div className="px-4 pb-4 pt-4">
        {step === "to_pickup" ? <GoToPickup a={a} onReached={() => reached("pickup")} /> : null}
        {step === "collect" ? <Collect a={a} onNotYet={notYet} onChanged={onChanged} demo={Boolean(demo)} /> : null}
        {step === "to_customer" ? <GoToCustomer a={a} onReached={() => reached("customer")} /> : null}
        {step === "otp" ? <CompleteWithOtp a={a} verifying={verifying} setVerifying={setVerifying} onNotYet={notYet} onCompleted={onCompleted} demo={demo} /> : null}
        {!verifying ? <CantDeliver a={a} onReported={onChanged} /> : null}
      </div>
    </section>
  );
}

/** Four bars: the steps done and the one in hand are green. The words are in the heading above. */
function Journey({ current }: { current: number }) {
  const { t } = useT();
  return (
    <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label={t("active.stepOf", { n: current + 1, total: STEPS.length })}>
      {STEPS.map((s, i) => (
        <li key={s.key} className={cn("h-2 rounded-full", i < current ? "bg-brand-600" : i === current ? "bg-brand-600 ring-2 ring-brand-200" : "bg-line-2")}>
          <span className="sr-only">{t(s.label)}{i < current ? ` (${t("common.done")})` : i === current ? ` (${t("common.current")})` : ""}</span>
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
      <button type="button" onClick={() => { setOpen(true); setError(null); }} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold text-ink-3 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-600">
        {t("fail.link")}
      </button>
      <BottomSheet open={open} onClose={() => (busy ? undefined : setOpen(false))} title={t("fail.title")} description={t("fail.description", { order: a.order.order_number })}
        footer={<Button fullWidth size="lg" variant="danger" className="h-14 rounded-2xl text-[17px]" loading={busy} disabled={!valid} onClick={submit}>{busy ? t("fail.reporting") : t("fail.submit")}</Button>}>
        <fieldset className="space-y-2">
          <legend className="sr-only">{t("fail.whatWentWrong")}</legend>
          {FAIL_REASONS.map((r) => (
            <label key={r.value} className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-3.5 py-2.5", reason === r.value ? "border-brand-600 bg-brand-50" : "border-line-2")}>
              <input type="radio" name="fail-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="h-5 w-5 shrink-0 accent-brand-600" />
              <span><span className="block text-[16px] font-semibold text-ink">{t(r.label)}</span><span className="block text-[13px] text-ink-3">{t(r.hint)}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="mt-3"><Textarea label={noteNeeded ? t("fail.whatHappened") : t("fail.noteOptional")} required={noteNeeded} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" maxLength={300} placeholder={t("fail.notePlaceholder")} /></div>
        {a.order.payment_method === "cod" ? <p className="mt-2 text-[14px] text-ink-2">{t("fail.codNote")}</p> : null}
        {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      </BottomSheet>
    </>
  );
}

/** The map stays folded until asked for, so the address and the two actions lead. */
function FoldedMap({ a, leg }: { a: RiderAssignment; leg: "store" | "customer" }) {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  const fix = useRiderStore((s) => s.gps.fix);
  const customer = customerOf(a);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-ink-2 active:bg-surface-2">
        <MapIcon className="h-5 w-5" aria-hidden />{open ? t("map.hide") : t("map.show")}
      </button>
      {open ? <LiveMap store={{ lat: a.pickup_lat ?? a.pickup.lat, lng: a.pickup_lng ?? a.pickup.lng, name: a.pickup.name }} customer={leg === "customer" ? customer.point : null} rider={fixToTrackingLocation(fix)} trail={[]} showRoute={leg === "customer"} className="mt-2" /> : null}
    </div>
  );
}

const secondaryBtn = "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-card px-3 text-[16px] font-bold text-ink ring-1 ring-line-2 select-none active:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600";
const secondaryOff = "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-surface-2 px-3 text-[15px] font-semibold text-ink-4";

/** Navigate + Call, side by side: plain anchors (Google Maps directions deep link and tel:, no API key needed). */
function ActionRow({ phone, dest, phoneTitle }: { phone: string | null; dest: { lat: number; lng: number } | null; /** Who the call goes to, for a screen reader; the button itself says "Call". */ phoneTitle: string }) {
  const { t } = useT();
  return (
    <div className="mt-4 grid grid-cols-2 gap-2.5">
      {dest ? <a href={navigateUrl(dest.lat, dest.lng)} target="_blank" rel="noreferrer" className={secondaryBtn}><Navigation className="h-5 w-5 text-info" aria-hidden /> {t("action.navigate")}</a> : <span className={secondaryOff}><Navigation className="h-5 w-5" aria-hidden /> {t("action.noLocation")}</span>}
      {phone ? <a href={`tel:${phone}`} aria-label={phoneTitle} className={secondaryBtn}><Phone className="h-5 w-5 text-brand-700" aria-hidden /> {t("action.call")}</a> : <span className={secondaryOff}><Phone className="h-5 w-5" aria-hidden /> {t("action.noNumber")}</span>}
    </div>
  );
}

/** A place written large: who or what it is, then each part of the address on its own line. */
function Place({ icon, tone, label, title, lines, children }: { icon: React.ReactNode; tone: "brand" | "info"; label: string; title: string; lines: string[]; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn("mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full", tone === "brand" ? "bg-brand-50 text-brand-700" : "bg-info-50 text-info")} aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink-3">{label}</p>
        <p className="break-words font-display text-[20px] font-extrabold leading-snug text-ink">{title}</p>
        <address className="mt-0.5 not-italic">
          {lines.map((line, i) => <span key={i} className="block break-words text-[17px] font-semibold leading-snug text-ink-2">{line}</span>)}
        </address>
        {children}
      </div>
    </div>
  );
}

/** Cash to collect in amber, or "already paid" in green: the same line on every step that needs it. */
function CashLine({ a, later }: { a: RiderAssignment; /** At the shop: the money is taken from the customer, not here. */ later?: boolean }) {
  const { t } = useT();
  const cod = a.order.payment_method === "cod" && Number(a.cod_amount) > 0;
  return (
    <p className={cn("mt-4 flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-[17px] font-bold", cod ? "bg-saffron-50 text-saffron-700" : "bg-success-50 text-success")}>
      <Banknote className="h-6 w-6 shrink-0" aria-hidden />
      <span>{cod ? t(later ? "collect.cashLater" : "req.collectCash", { amount: formatINR(a.cod_amount) }) : t("req.prepaid")}</span>
    </p>
  );
}

const nextBtn = "mt-4 h-16 rounded-2xl text-[19px]";
const backLink = "mt-2 flex min-h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold text-ink-3 underline underline-offset-4 disabled:opacity-50";

function GoToPickup({ a, onReached }: { a: RiderAssignment; onReached: () => void }) {
  const { t } = useT();
  const lines = [[a.pickup.address_line1, a.pickup.area].filter(Boolean).join(", ")].filter(Boolean);
  return (
    <div>
      <Place icon={<StoreIcon className="h-6 w-6" />} tone="brand" label={t("addr.shop")} title={a.pickup.name} lines={lines}>
        <p className="mt-1 text-[15px] text-ink-3">{a.order.item_count === 1 ? t("pickup.oneItemToCollect") : t("pickup.itemsToCollect", { n: a.order.item_count })}</p>
      </Place>
      <ActionRow phone={a.pickup.phone} dest={{ lat: a.pickup_lat ?? a.pickup.lat, lng: a.pickup_lng ?? a.pickup.lng }} phoneTitle={t("action.callShop")} />
      <FoldedMap a={a} leg="store" />
      <Button size="lg" fullWidth className={nextBtn} onClick={onReached}>{t("pickup.reached")} <ChevronRight className="h-6 w-6" aria-hidden /></Button>
    </div>
  );
}

function Collect({ a, onNotYet, onChanged, demo }: { a: RiderAssignment; onNotYet: () => void; onChanged: () => void; demo: boolean }) {
  const { t } = useT();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const confirm = async () => {
    if (busy || demo) return;
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
      <p className="text-[15px] font-semibold text-ink-2">{a.order.item_count === 1 ? t("pickup.oneItemToCollect") : t("pickup.itemsToCollect", { n: a.order.item_count })}</p>
      <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-surface-2">
        {a.items.map((it, i) => (
          <li key={`${it.name}-${i}`} className="flex items-center gap-3 px-3.5 py-3">
            <span className="flex h-9 min-w-11 items-center justify-center rounded-xl bg-card px-2 text-[16px] font-extrabold tabular text-ink shadow-sm">× {it.quantity}</span>
            <span className="min-w-0 flex-1"><span className="block break-words text-[16px] font-semibold leading-snug text-ink">{it.name}</span>{it.pack_label ? <span className="block text-[14px] text-ink-3">{it.pack_label}</span> : null}{lineOptionsText(it) ? <span className="block text-[14px] font-semibold text-saffron-700">{lineOptionsText(it)}</span> : null}</span>
          </li>
        ))}
      </ul>
      <CashLine a={a} later />
      {error ? <Alert tone="danger" className="mt-3 rounded-2xl text-[15px]">{error}</Alert> : null}
      <Button size="lg" fullWidth className={nextBtn} loading={busy} onClick={confirm}>{busy ? t("collect.confirming") : <><Check className="h-6 w-6" aria-hidden /> {t("collect.pickedUpAll")}</>}</Button>
      <PickupScan a={a} onChanged={onChanged} />
      <button type="button" onClick={onNotYet} className={backLink}>{t("step.notAtShop")}</button>
    </div>
  );
}

function GoToCustomer({ a, onReached }: { a: RiderAssignment; onReached: () => void }) {
  const { t } = useT();
  const c = customerOf(a);
  const lines = addressLines(a.order.address, (landmark) => t("addr.near", { landmark }));
  return (
    <div>
      <Place icon={<Home className="h-6 w-6" />} tone="info" label={t("req.deliverTo")} title={c.name} lines={lines.length ? lines : [t("customer.noAddress")]}>
        {a.order.delivery_instructions ? <p className="mt-2 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[15px] text-ink"><MessageSquareText className="mt-0.5 h-4.5 w-4.5 shrink-0 text-ink-3" aria-hidden /><span className="min-w-0 break-words"><span className="block text-[13px] font-semibold text-ink-3">{t("addr.note")}</span>{a.order.delivery_instructions}</span></p> : null}
      </Place>
      <CashLine a={a} />
      <ActionRow phone={c.phone} dest={c.point} phoneTitle={t("action.callCustomer")} />
      <FoldedMap a={a} leg="customer" />
      <Button size="lg" fullWidth className={nextBtn} onClick={onReached}>{t("customer.reached")} <ChevronRight className="h-6 w-6" aria-hidden /></Button>
    </div>
  );
}

/**
 * What the database recorded about this delivery's code: how the SMS went, the tries left and the resend
 * allowance. Read straight from `rider_delivery_otp_state` (the rider's own assignment only), every few
 * seconds while an SMS is on its way and more slowly after. `state` stays null on a database without 0059,
 * and the step then reads as it did before. The code itself is never part of it.
 */
function useDeliveryCodeState(assignmentId: string, fixed?: RiderDeliveryCodeState | null) {
  const demo = fixed !== undefined;
  const [got, setGot] = React.useState<{ state: RiderDeliveryCodeState; at: number } | null>(() => (fixed ? { state: fixed, at: Date.now() } : null));
  const [loaded, setLoaded] = React.useState(demo);
  const [unsupported, setUnsupported] = React.useState(false);
  const refresh = React.useCallback(async () => {
    if (demo) return;
    try {
      const { data, error } = await createClient().rpc("rider_delivery_otp_state" as never, { p_assignment_id: assignmentId } as never);
      if (error) { if (error.code === "PGRST202" || error.code === "42883") setUnsupported(true); }
      else if (data) setGot({ state: data as unknown as RiderDeliveryCodeState, at: Date.now() });
    } catch { /* offline: the last answer stays on screen */ }
    finally { setLoaded(true); }
  }, [assignmentId, demo]);
  const sms = got?.state.sms.status ?? null;
  // Quick while something is about to change (the arrival being recorded, an SMS on its way), slow otherwise.
  const settling = !got || sms === "pending" || sms === "queued" || (got.state.applies && !got.state.arrived);
  React.useEffect(() => {
    if (unsupported || demo) return;
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) void refresh(); }, settling ? 3000 : 12000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [refresh, settling, unsupported, demo]);
  const put = React.useCallback((state: RiderDeliveryCodeState) => setGot({ state, at: Date.now() }), []);
  return { state: got?.state ?? null, at: got?.at ?? 0, loaded, refresh, put, demo };
}

const RESEND_REFUSALS: Record<string, TKey> = { OTP_RESEND_LIMIT: "otp.resendNone", OTP_SEND_IN_PROGRESS: "otp.smsSending", OTP_SMS_UNAVAILABLE: "otp.smsNone", OTP_LOCKED: "otp.locked", OTP_NOT_ARRIVED: "otp.notArrived" };

/**
 * How the code reached the customer, as the server recorded it: sent (to the last two digits only), still
 * sending, not sent, or never sent because SMS is not set up. "Sent" appears only when the SMS panel accepted
 * the message. Asking for a new SMS goes to the server; its cooldown and cap are the database's.
 */
function useCodeSend(a: RiderAssignment, code: ReturnType<typeof useDeliveryCodeState>, online: boolean) {
  const { t } = useT();
  const now = useNow();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const [smsOff, setSmsOff] = React.useState(false);
  const s = code.state;
  const sms = s?.sms.status ?? null;
  const sending = sms === "pending" || sms === "queued";
  const noSms = smsOff || sms === "unavailable" || sms === "no_recipient";
  const wait = s ? Math.max(0, s.resend.retry_in_seconds - Math.floor(((now || code.at) - code.at) / 1000)) : 0;
  const line = !s ? (code.loaded ? t("otp.fromApp") : null)
    : sms === "sent" ? (s.sms.live ? t("otp.smsSent", { tail: s.sms.phone_tail ?? "••" }) : t("otp.smsExpired"))
    : sending ? t("otp.smsSending")
    : sms === "failed" ? t("otp.smsFailed")
    : sms === null ? t("otp.fromApp")
    : t("otp.smsNone");
  const tone: "success" | "info" | "warning" | "neutral" = !s ? "neutral" : sms === "sent" && s.sms.live ? "success" : sending ? "info" : sms === "failed" || sms === "sent" ? "warning" : "neutral";

  const resend = async () => {
    if (busy || !online || code.demo) return;
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
  /** Whether a new SMS can be asked for at all, and if so whether any are left. */
  const canAsk = Boolean(s) && !noSms && !s!.locked && s!.arrived;
  return { state: s, sms, line, tone, note, busy, sending, wait, canAsk, resend };
}

const FAIL_TITLE: Record<OtpFailCode, TKey> = { OTP_INCORRECT: "otp.wrong", OTP_EXPIRED: "otp.expired", OTP_NOT_ISSUED: "otp.notIssued", OTP_LOCKED: "otp.lockedTitle" };
const CODE_LENGTH = 4;

/**
 * Four large boxes for the code. One real number field lies over them (invisible, 16 px so iOS does not zoom),
 * so the phone's number pad, paste and the backspace key all behave as in any field; the boxes only draw it.
 */
function CodeBoxes({ id, value, onChange, disabled, invalid, label, autoFocus }: { id: string; value: string; onChange: (v: string) => void; disabled: boolean; invalid: boolean; label: string; autoFocus?: boolean }) {
  const [focused, setFocused] = React.useState(false);
  const at = Math.min(value.length, CODE_LENGTH - 1);
  return (
    <div className="relative mt-3">
      <div className="grid grid-cols-4 gap-2.5" aria-hidden>
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <span key={i} className={cn("flex h-[72px] items-center justify-center rounded-2xl border-2 bg-card font-display text-[36px] font-extrabold tabular text-ink transition-colors duration-150 motion-reduce:transition-none",
            invalid ? "border-danger bg-danger-50" : focused && i === at ? "border-brand-600 ring-4 ring-brand-100" : value[i] ? "border-brand-600" : "border-line-2", disabled && "opacity-50")}>{value[i] ?? ""}</span>
        ))}
      </div>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={CODE_LENGTH} aria-label={label} aria-invalid={invalid} disabled={disabled} autoFocus={autoFocus}
        className="absolute inset-0 h-full w-full cursor-pointer rounded-2xl bg-transparent text-[16px] text-transparent caret-transparent opacity-0 disabled:cursor-not-allowed" />
    </div>
  );
}

function CompleteWithOtp({ a, verifying, setVerifying, onNotYet, onCompleted, demo }: { a: RiderAssignment; verifying: boolean; setVerifying: (v: boolean) => void; onNotYet: () => void; onCompleted: (c: CompletedDelivery) => void; demo?: ActiveDeliveryDemo }) {
  const { t } = useT();
  const [otp, setOtp] = React.useState("");
  const [fail, setFail] = React.useState<CodeFail | null>(demo?.fail ?? null);
  const [cash, setCash] = React.useState(false);
  const upi = useUpiDetails();
  const [mode, setMode] = React.useState<"cash" | "upi">("cash");
  const byUpi = Boolean(upi) && mode === "upi";
  const [error, setError] = React.useState<string | null>(null);
  const cod = a.order.payment_method === "cod" && Number(a.cod_amount) > 0;
  const c = customerOf(a);
  const online = useNetworkOnline();
  const code = useDeliveryCodeState(a.id, demo ? demo.code ?? null : undefined);
  const locked = Boolean(fail?.locked) || Boolean(code.state?.locked);

  // The "reached" tap could not be recorded (a dropped request): the code is only sent once the server knows,
  // so it is tried again here, once, when the server has twice answered that it has no arrival for this delivery.
  const missing = React.useRef(0);
  const { state: codeState, refresh: refreshCode } = code;
  React.useEffect(() => {
    if (demo || !codeState || codeState.arrived || !codeState.applies || !online) return;
    missing.current += 1;
    if (missing.current !== 2) return;
    void riderArrivedAction(a.id, "customer").then(() => refreshCode(), () => undefined);
  }, [codeState, online, a.id, refreshCode, demo]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== CODE_LENGTH || verifying || (cod && !cash) || demo) return;
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

  const send = useCodeSend(a, code, online);
  const support = <a href={`tel:+${site.supportPhone.replace(/\D/g, "")}`} className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-card px-3 text-[16px] font-bold text-danger ring-1 ring-danger/30"><Phone className="h-5 w-5" aria-hidden />{t("otp.callSupport")}</a>;
  const triesLeft = !locked && code.state ? code.state.attempts_left : null;
  // Why the big button is not ready yet, in one line, so a greyed button is never a puzzle.
  const waitingFor = locked || !online ? null : cod && !cash ? t("otp.tickCashFirst") : otp.length !== CODE_LENGTH ? t("otp.enterAll") : null;

  return (
    <form onSubmit={submit}>
      {cod ? (
        <div className="rounded-2xl bg-saffron-50 p-3.5">
          <p className="text-[14px] font-bold text-saffron-700">{byUpi ? t("otp.collectByUpi") : t("otp.collectCash")}</p>
          <p className="font-display text-[34px] font-extrabold leading-tight tabular text-ink">{formatINR(a.cod_amount)}</p>
          <p className="text-[15px] text-ink-2">{t("otp.collectBefore", { name: c.name })}</p>
          {upi ? (
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={t("otp.howPaying")}>
              {(["cash", "upi"] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} disabled={verifying} onClick={() => { setMode(m); setCash(false); }} className={cn("min-h-12 rounded-xl border-2 text-[16px] font-bold", mode === m ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line-2 bg-card text-ink-2")}>{m === "cash" ? t("otp.cash") : "UPI"}</button>)}
            </div>
          ) : null}
          {byUpi && upi ? <div className="mt-3 rounded-xl bg-card p-3"><UpiQr upi={upi} amount={Number(a.cod_amount)} note={a.order.order_number} /></div> : null}
          <label className={cn("mt-3 flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 bg-card px-3.5 py-2.5 text-[16px] font-bold leading-snug text-ink", cash ? "border-brand-600" : "border-saffron-300")}>
            <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} className="h-6 w-6 shrink-0 accent-brand-600" disabled={verifying} />
            <span>{byUpi ? t("otp.sawUpi", { amount: formatINR(a.cod_amount), name: c.name }) : t("otp.collectedCash", { amount: formatINR(a.cod_amount), name: c.name })}</span>
          </label>
        </div>
      ) : (
        <p className="flex items-center gap-2.5 rounded-2xl bg-success-50 px-3.5 py-3 text-[17px] font-bold text-success"><Banknote className="h-6 w-6 shrink-0" aria-hidden /><span>{t("req.prepaid")}</span></p>
      )}

      {/* How the code reached the customer, before the rider asks for it. */}
      <div className="mt-4 space-y-2" aria-live="polite">
        {send.line ? (
          <Alert tone={send.tone} className="rounded-2xl text-[15px]">
            {send.line}
            {send.state?.customer_has_code ? <span className="mt-1 block font-bold">{t("otp.customerHasCode")}</span> : null}
          </Alert>
        ) : null}
        {send.note ? <Alert tone={send.note.tone} className="rounded-2xl text-[15px]">{send.note.text}</Alert> : null}
      </div>

      <label htmlFor={`otp-${a.id}`} className="mt-4 flex items-start gap-2 text-[18px] font-extrabold leading-snug text-ink"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden /> {t("otp.ask", { name: c.name })}</label>
      <p className="mt-0.5 text-[14px] text-ink-3">{t("otp.onlyCustomer")}</p>
      <CodeBoxes id={`otp-${a.id}`} value={otp} onChange={setOtp} disabled={verifying || locked} invalid={Boolean(fail) && !locked && otp.length === 0} label={t("otp.label")} autoFocus={!cod} />
      {triesLeft != null ? <p className="mt-2 text-center text-[14px] font-semibold text-ink-2">{t("otp.triesLeft", { n: triesLeft })}</p> : null}

      {fail ? <Alert tone="danger" className="mt-3 rounded-2xl text-[15px]" title={fail.code ? t(FAIL_TITLE[fail.code]) : fail.reason}>
        {fail.locked || fail.code === "OTP_LOCKED" ? <>{t("otp.locked")}{support}</>
          : fail.code === "OTP_EXPIRED" ? t("otp.expiredBody")
          : fail.code === "OTP_NOT_ISSUED" ? t("otp.notIssuedBody")
          : typeof fail.attempts_left === "number" ? t("otp.attemptsLeft", { n: fail.attempts_left }) : null}
      </Alert> : locked ? <Alert tone="danger" className="mt-3 rounded-2xl text-[15px]" title={t("otp.lockedTitle")}>{t("otp.locked")}{support}</Alert> : null}
      {!online ? <Alert tone="danger" className="mt-3 rounded-2xl text-[15px]" icon={<WifiOff className="h-4 w-4" />}>{t("otp.offline")}</Alert> : null}
      {error ? <Alert tone="danger" className="mt-3 rounded-2xl text-[15px]">{error}</Alert> : null}

      <Button type="submit" size="lg" fullWidth className={nextBtn} loading={verifying} disabled={otp.length !== CODE_LENGTH || (cod && !cash) || locked || !online}>{verifying ? t("otp.verifying") : <><Check className="h-6 w-6" aria-hidden /> {t("otp.verify")}</>}</Button>
      {waitingFor ? <p className="mt-2 text-center text-[14px] text-ink-3">{waitingFor}</p> : null}

      {send.canAsk && send.state ? (
        send.state.resend.left > 0 || send.sms === null ? (
          <div className="mt-3">
            <Button type="button" variant="outline" fullWidth className="min-h-12 rounded-2xl text-[16px]" loading={send.busy} disabled={verifying || send.busy || !online || send.sending || send.wait > 0} onClick={send.resend}>
              {send.busy ? t("otp.resending") : send.wait > 0 ? t("otp.resendIn", { s: send.wait }) : send.sms === null ? t("otp.sendSms") : t("otp.resend")}
            </Button>
            {send.sms !== null ? <p className="mt-1 text-center text-[13px] text-ink-3">{t("otp.resendsLeft", { n: send.state.resend.left })}</p> : null}
          </div>
        ) : <p className="mt-3 text-center text-[14px] text-ink-3">{t("otp.resendNone")}</p>
      ) : null}
      <button type="button" onClick={onNotYet} disabled={verifying} className={backLink}>{t("step.notAtCustomer")}</button>
    </form>
  );
}

/** Shown after a successful code check until the rider taps "Back to home". */
export function DeliveryComplete({ completed, onDone }: { completed: CompletedDelivery; onDone: () => void }) {
  const { t } = useT();
  const { assignment: a } = completed;
  const cod = a.order.payment_method === "cod" && Number(a.cod_amount) > 0;
  return (
    <section className="rounded-[24px] bg-card px-5 py-8 text-center shadow-card ring-1 ring-success/30 motion-safe:animate-pop" role="status">
      <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success text-white"><Check className="h-10 w-10" strokeWidth={3} aria-hidden /></span>
      <h2 className="mt-4 font-display text-[28px] font-extrabold leading-tight text-ink">{t("done.title")}</h2>
      <p className="text-[15px] text-ink-3">{t("req.order", { number: a.order.order_number })}</p>
      <p className="mt-5 text-[14px] font-semibold text-ink-3">{t("done.addedToEarnings")}</p>
      <p className="font-display text-[40px] font-extrabold leading-tight tabular text-brand-700">{formatINR(a.earning)}</p>
      <p className="text-[14px] text-ink-3">{t("done.payoutPending")}</p>
      {cod ? <p className="mt-3 rounded-2xl bg-saffron-50 px-3.5 py-3 text-[16px] font-bold text-saffron-700">{t("done.cashCollected", { amount: formatINR(a.cod_amount) })}</p> : null}
      <Button size="lg" fullWidth className="mt-6 h-16 rounded-2xl text-[19px]" onClick={onDone}>{t("done.backHome")}</Button>
    </section>
  );
}
