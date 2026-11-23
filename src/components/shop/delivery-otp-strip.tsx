"use client";
import * as React from "react";
import { Eye, EyeOff, MessageSquareText, Phone, RefreshCw, ShieldCheck } from "lucide-react";
import { site } from "@/config/site";
import { cn, formatTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { CustomerDeliveryCode } from "@/types/app";

/** How long the code stays on screen after a tap before it covers itself again. */
const HIDE_AFTER_MS = 30_000;
/** The card's clock: it notices an expired code this often, and asks the server how things stand every third tick. */
const TICK_MS = 5_000;

const SHARE_NOTE = "Share this code with the delivery partner only when your order is at your door. Don’t read it out on a call or send it in a message: nobody from Merta Deal will ever ask you for it.";

/** The code this phone was given, kept for this tab until it expires, so a refresh does not have to make a new one. */
type Held = { code: string; issued_at: string; expires_at: string };
const heldKey = (orderId: string) => `md_delivery_code:${orderId}`;
function readHeld(orderId: string): Held | null {
  try {
    const h = JSON.parse(sessionStorage.getItem(heldKey(orderId)) ?? "null") as Held | null;
    return h && typeof h.code === "string" && typeof h.issued_at === "string" && typeof h.expires_at === "string" ? h : null;
  } catch { return null; }
}
function writeHeld(orderId: string, h: Held | null) {
  try { if (h) sessionStorage.setItem(heldKey(orderId), JSON.stringify(h)); else sessionStorage.removeItem(heldKey(orderId)); } catch { /* private mode: the code simply is not kept across a refresh */ }
}

/**
 * The customer's delivery code while the order is out for delivery.
 *
 * Since migration 0059 no code is stored in plain text, so nothing arrives with the page. With an
 * `orderId` the card asks `customer_delivery_code` (the order's own customer only) how things stand: whether
 * a code went out by SMS and to which number's last two digits, and whether the order is at the door. "Show
 * code" makes a code for this screen, which is how a delivery completes when the SMS is not configured or
 * could not be sent; the SMS code and the on-screen code both work. The code is covered until tapped, covers
 * itself again after half a minute or when the app goes to the background, and never leaves this phone.
 *
 * Before that migration (and on the public track-by-code page, which has no `orderId`) the `otp` the server
 * sent with the page is shown as before.
 */
export function DeliveryOtpStrip({ otp, locked, className, orderId, refreshKey }: {
  /** The code as the page carried it before 0059; null afterwards. */ otp: string | null | undefined;
  locked?: boolean | null; className?: string;
  /** The customer's own order: lets the card read the code state and make an on-screen code. */ orderId?: string;
  /** Changes whenever the screen has fresh order data (a Realtime event, a manual refresh): the card re-reads its state. */ refreshKey?: number | string | null;
}) {
  if (orderId) return <LiveCode orderId={orderId} legacyOtp={otp ?? null} locked={Boolean(locked)} refreshKey={refreshKey ?? null} className={className} />;
  if (locked) return <LockedCard className={className} />;
  if (otp) return <LegacyCode otp={otp} className={className} />;
  // No signed-in order here and no code on the page: the lookup by order number and phone number shows none.
  return (
    <section className={cn("rounded-xl border border-saffron-300 bg-saffron-50 p-4 text-sm", className)} role="status">
      <p className="font-bold text-ink">Delivery code</p>
      <p className="mt-0.5 text-ink-2">For your safety the delivery code is not shown on this page. Sign in and open this order to see it. If a code reaches you by SMS when the delivery partner arrives, that one works too.</p>
    </section>
  );
}

function LockedCard({ className }: { className?: string }) {
  return (
    <section className={cn("rounded-xl border border-danger/30 bg-danger-50 p-4 text-sm", className)} role="status">
      <p className="font-bold text-ink">Delivery code locked after too many wrong tries</p>
      <p className="mt-0.5 text-ink-2">Call support. They confirm the handover with you and complete the delivery.</p>
      <a href={`tel:+${site.supportPhone.replace(/\D/g, "")}`} className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-bold text-brand-700"><Phone className="h-4 w-4" aria-hidden /> {site.supportPhone}</a>
    </section>
  );
}

/** Covers the code again after half a minute, or as soon as the app goes to the background. */
function useAutoCover(shown: boolean, cover: () => void) {
  React.useEffect(() => {
    if (!shown) return;
    const t = setTimeout(cover, HIDE_AFTER_MS);
    const onHide = () => { if (document.visibilityState === "hidden") cover(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", onHide); };
  }, [shown, cover]);
}

function Header({ sub }: { sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-saffron-100 text-saffron-700"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
      <div className="min-w-0">
        <h2 id="otp-title" className="font-sans text-[15px] font-bold leading-snug tracking-normal text-ink">Delivery code</h2>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{sub}</p>
      </div>
    </div>
  );
}

/** The covered / revealed digits. Tapping toggles; nothing is fetched here. */
function CodeButton({ code, shown, onToggle }: { code: string; shown: boolean; onToggle: () => void }) {
  const digits = code.split("");
  return (
    <button type="button" onClick={onToggle} aria-pressed={shown} aria-label={shown ? "Hide delivery code" : "Show delivery code"}
      className="tap mt-3 flex w-full items-center justify-between gap-3 rounded-lg bg-card px-3 py-2.5 text-left shadow-card transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron-600">
      <span className="flex gap-1.5" aria-hidden>
        {digits.map((d, i) => (
          <span key={i} className="flex h-11 w-9 items-center justify-center rounded-lg border border-line bg-surface font-display text-xl font-extrabold tabular text-ink min-[400px]:w-10">{shown ? d : "•"}</span>
        ))}
      </span>
      <span className="sr-only" aria-live="polite">{shown ? `Your delivery code is ${digits.join(" ")}` : "Delivery code hidden"}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-bold text-saffron-700">{shown ? <><EyeOff className="h-4 w-4" aria-hidden />Hide</> : <><Eye className="h-4 w-4" aria-hidden />Tap to reveal</>}</span>
    </button>
  );
}

/** The code the page itself carried (databases without 0059, and the public lookup page there). */
function LegacyCode({ otp, className }: { otp: string; className?: string }) {
  const [shown, setShown] = React.useState(false);
  const cover = React.useCallback(() => setShown(false), []);
  useAutoCover(shown, cover);
  return (
    <section aria-labelledby="otp-title" className={cn("rounded-xl border border-saffron-300 bg-saffron-50 p-4 shadow-card", className)}>
      <Header sub="For the delivery partner, at your door" />
      <CodeButton code={otp} shown={shown} onToggle={() => setShown((v) => !v)} />
      <p className="mt-2.5 text-xs leading-relaxed text-ink-2">{SHARE_NOTE}</p>
    </section>
  );
}

type Mode = "loading" | "ready" | "legacy" | "hidden" | "error";

function LiveCode({ orderId, legacyOtp, locked, refreshKey, className }: { orderId: string; legacyOtp: string | null; locked: boolean; refreshKey: number | string | null; className?: string }) {
  const [mode, setMode] = React.useState<Mode>("loading");
  const [info, setInfo] = React.useState<CustomerDeliveryCode | null>(null);
  const [held, setHeld] = React.useState<Held | null>(null);
  const heldRef = React.useRef<Held | null>(null);
  const [shown, setShown] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(0);
  const cover = React.useCallback(() => setShown(false), []);
  useAutoCover(shown, cover);

  const keep = React.useCallback((h: Held | null) => { heldRef.current = h; setHeld(h); writeHeld(orderId, h); }, [orderId]);

  const load = React.useCallback(async () => {
    try {
      const { data, error } = await createClient().rpc("customer_delivery_code" as never, { p_order_id: orderId, p_reveal: false } as never);
      if (error) {
        // The function is not there: this database still sends the code with the page.
        if (error.code === "PGRST202" || error.code === "42883") setMode("legacy");
        else if (/FORBIDDEN/.test(error.message)) setMode("hidden");
        else setMode((m) => (m === "ready" ? m : "error"));
        return;
      }
      const d = data as unknown as CustomerDeliveryCode;
      setInfo(d); setMode("ready"); setNow(Date.now());
      // A code kept on this phone is good only while it is still the one the server holds for this screen.
      const cur = heldRef.current ?? readHeld(orderId);
      const still = cur && d.available && d.app?.live && d.app.issued_at === cur.issued_at ? cur : null;
      if (still !== heldRef.current) keep(still);
      if (!still) setShown(false);
    } catch { setMode((m) => (m === "ready" ? m : "error")); }
  }, [orderId, keep]);

  React.useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    let ticks = 0;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      if (++ticks % 3 === 0) void load();
    }, TICK_MS);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load, refreshKey]);

  const expired = Boolean(held && now > 0 && new Date(held.expires_at).getTime() <= now);
  const live = held && !expired ? held : null;

  const reveal = async () => {
    if (busy) return;
    setBusy(true); setProblem(null);
    try {
      const { data, error } = await createClient().rpc("customer_delivery_code" as never, { p_order_id: orderId, p_reveal: true } as never);
      const d = error ? null : (data as unknown as CustomerDeliveryCode | null);
      if (!d) { setProblem("We couldn’t get your code. Check your internet connection and try again."); return; }
      setInfo(d); setNow(Date.now());
      if (d.code && d.app?.issued_at && d.app.expires_at) { keep({ code: d.code, issued_at: d.app.issued_at, expires_at: d.app.expires_at }); setShown(true); }
      else if (!d.available) setProblem("This order is no longer out for delivery.");
    } catch { setProblem("We couldn’t get your code. Check your internet connection and try again."); }
    finally { setBusy(false); }
  };

  if (mode === "loading") return locked ? <LockedCard className={className} /> : legacyOtp ? <LegacyCode otp={legacyOtp} className={className} /> : null;
  if (mode === "legacy" || mode === "hidden") return locked ? <LockedCard className={className} /> : legacyOtp ? <LegacyCode otp={legacyOtp} className={className} /> : null;
  if (mode === "error") {
    if (legacyOtp) return <LegacyCode otp={legacyOtp} className={className} />;
    return (
      <section className={cn("rounded-xl border border-saffron-300 bg-saffron-50 p-4 text-sm", className)} role="status">
        <p className="font-bold text-ink">Delivery code</p>
        <p className="mt-0.5 text-ink-2">We couldn&rsquo;t load your delivery code. Check your internet connection.</p>
        <button type="button" onClick={() => void load()} className="tap mt-2 inline-flex min-h-11 items-center gap-1.5 font-bold text-saffron-700"><RefreshCw className="h-4 w-4" aria-hidden /> Try again</button>
      </section>
    );
  }
  if (locked || info?.locked) return <LockedCard className={className} />;
  if (!info?.available) return null;

  const sms = info.sms?.status ?? null;
  const smsLine = sms === "sent" && info.sms?.live ? `We sent a code by SMS to your number ending in ${info.sms.phone_tail ?? "••"}. That code or the one shown here will work.`
    : sms === "pending" || sms === "queued" ? "Sending a code to your phone by SMS…"
    : sms === "failed" ? "The SMS with your code could not be sent. Use the code shown here instead."
    : null;

  return (
    <section aria-labelledby="otp-title" className={cn("rounded-xl border border-saffron-300 bg-saffron-50 p-4 shadow-card", className)}>
      <Header sub={info.arrived ? "Your delivery partner has reached you" : "For the delivery partner, at your door"} />
      {smsLine ? <p className="mt-3 flex items-start gap-2 rounded-lg bg-card px-3 py-2 text-[13px] leading-snug text-ink-2"><MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-saffron-700" aria-hidden />{smsLine}</p> : null}

      {live ? (
        <>
          <CodeButton code={live.code} shown={shown} onToggle={() => setShown((v) => !v)} />
          <p className="mt-1.5 text-xs text-ink-3">Works until {formatTime(live.expires_at)}. After that, tap for a new one.</p>
        </>
      ) : (
        <button type="button" onClick={reveal} disabled={busy} aria-busy={busy}
          className="tap mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-saffron-600 px-3 text-[15px] font-bold text-white shadow-card disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron-600">
          <Eye className="h-4 w-4" aria-hidden />{busy ? "Getting your code…" : expired ? "Show a new code" : "Show code"}
        </button>
      )}
      {expired && !live ? <p className="mt-1.5 text-xs text-ink-3">The code that was on this screen has run out.</p> : null}
      {problem ? <p className="mt-2 text-xs font-semibold text-danger" role="alert">{problem}</p> : null}

      <p className="mt-2.5 text-xs leading-relaxed text-ink-2">{SHARE_NOTE}</p>
    </section>
  );
}
