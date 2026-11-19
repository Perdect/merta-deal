"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { sendPhoneOtpAction, verifyPhoneOtpAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { InstallButtons } from "@/components/pwa/install-buttons";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/client";
import { notifySessionChanged } from "@/stores/me-store";
import { OtpInput } from "./otp-input";

const RESEND_AFTER_S = 30;
const spaced = (m: string) => (m.length === 10 ? `${m.slice(0, 5)} ${m.slice(5)}` : m);

/**
 * Customer sign-in: mobile number, then the 6-digit code sent to it. There is nothing else on the screen:
 * a number seen for the first time gets its account when the code is checked, so there is no sign-up step,
 * no PIN and no guest button here. Errors come from the server and are shown as they are; nothing is called
 * sent unless the send succeeded.
 */
export function LoginForm({ next, phoneEnabled, confirmed, initial }: {
  next?: string; phoneEnabled: boolean; confirmed?: boolean;
  /** Development preview only: open on the code step without sending anything. */
  initial?: { mobile: string; step: "otp" };
}) {
  const router = useRouter();
  const [mobile, setMobile] = React.useState(initial?.mobile ?? "");
  const [step, setStep] = React.useState<"mobile" | "otp">(initial?.step ?? "mobile");
  const [otp, setOtp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(initial ? RESEND_AFTER_S : 0);
  // A guest (anonymous session) signing in keeps their cart and addresses: the id lets the server merge them.
  const [guestId, setGuestId] = React.useState("");
  React.useEffect(() => { createClient().auth.getUser().then(({ data }) => setGuestId(data.user?.is_anonymous ? data.user.id : "")).catch(() => {}); }, []);
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendOtp = async () => {
    if (mobile.length !== 10 || busy) return;
    setBusy(true); setError(null);
    const r = await sendPhoneOtpAction(mobile);
    setBusy(false);
    if (r.ok) { setOtp(""); setStep("otp"); setCooldown(RESEND_AFTER_S); } else setError(r.error);
  };
  const verify = async (code = otp) => {
    if (code.length !== 6 || busy) return;
    setBusy(true); setError(null);
    const r = await verifyPhoneOtpAction(mobile, code, guestId || undefined);
    if (!r.ok) { setBusy(false); setOtp(""); setError(r.error); return; }
    notifySessionChanged();
    router.replace(safeNext(next, r.redirectTo ?? "/"));
  };

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="px-8 text-center font-display text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-[26px]">
        {step === "otp" ? "Enter the code" : <>Sign in to <span className="text-brand-700">start ordering</span></>}
      </h1>
      {confirmed && step === "mobile" ? <Alert tone="success" className="mt-4">Your account is active. You can sign in now.</Alert> : null}

      {step === "mobile" ? (
        <form className="mt-6 space-y-3" onSubmit={(e) => { e.preventDefault(); void sendOtp(); }} noValidate>
          <Input name="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={mobile} autoFocus
            onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(null); }}
            leftIcon={<span className="inline-flex items-center gap-1 text-sm font-bold text-ink"><span aria-hidden>🇮🇳</span>+91</span>}
            className="h-14 rounded-xl pl-20 text-base" placeholder="Enter Phone Number" aria-label="Mobile number" disabled={!phoneEnabled} />
          {phoneEnabled ? null : <Alert tone="warning">Sign-in by OTP is not switched on for this site yet.</Alert>}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" size="lg" fullWidth className="h-13 rounded-xl text-base" disabled={mobile.length !== 10 || !phoneEnabled} loading={busy}>Continue</Button>
          <p className="pt-1 text-center text-xs text-ink-3">We&apos;ll text a 6-digit code to this number. New here? The same step creates your account.</p>
        </form>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="flex flex-wrap items-center justify-center gap-x-1 text-center text-sm text-ink-2">Sent by SMS to <span className="font-semibold text-ink">+91 {spaced(mobile)}</span>
            <button type="button" onClick={() => { setStep("mobile"); setOtp(""); setError(null); }} aria-label="Change mobile number" className="tap inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-700 hover:bg-surface-2"><Pencil className="h-4 w-4" aria-hidden /></button></p>
          <OtpInput value={otp} onChange={(v) => { setOtp(v); setError(null); if (v.length === 6) void verify(v); }} autoFocus disabled={busy} />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="button" size="lg" fullWidth className="h-13 rounded-xl text-base" disabled={otp.length !== 6} loading={busy} onClick={() => void verify()}>Verify &amp; continue</Button>
          <p className="text-center text-sm text-ink-3" aria-live="polite">
            {cooldown > 0 ? <>Didn&apos;t get it? Resend in <span className="font-semibold tabular-nums text-ink">{cooldown}s</span></> : <button type="button" onClick={() => void sendOtp()} disabled={busy} className="tap min-h-11 font-semibold text-brand-700">Resend code</button>}
          </p>
        </div>
      )}

      <p className="mt-4 text-center text-xs leading-relaxed text-ink-3">By continuing, you agree to our<br /><Link href="/terms" target="_blank" className="font-semibold text-brand-700">Terms and Conditions</Link> &amp; <Link href="/privacy" target="_blank" className="font-semibold text-brand-700">Privacy Policy</Link></p>

      <div className="mt-auto pt-7">
        <div className="rounded-2xl bg-surface-2 px-4 py-4">
          <p className="text-center text-xs font-medium text-ink-2">Order faster with the Merta Deal app</p>
          <InstallButtons className="mt-3 flex flex-wrap justify-center gap-2 space-y-0 [&>p]:hidden" />
        </div>
        <p className="mt-4 text-center text-xs text-ink-3">Delivery partner? <Link href="/rider/login" className="font-semibold text-ink-2 underline-offset-2 hover:underline">Sign in here</Link></p>
      </div>
    </div>
  );
}
