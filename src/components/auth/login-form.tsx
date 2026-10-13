"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Smartphone, UserRound, Eye, EyeOff } from "lucide-react";
import { signInAction, sendPhoneOtpAction, verifyPhoneOtpAction, type AuthResult } from "@/lib/actions/auth";
import { continueAsGuestAction } from "@/lib/actions/guest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

/** Sign in with mobile number + 6-digit PIN. OTP login appears only when the project has an SMS provider. */
export function LoginForm({ next, phoneEnabled, guestEnabled, confirmed, reason }: { next?: string; phoneEnabled: boolean; guestEnabled: boolean; confirmed?: boolean; reason?: string }) {
  const router = useRouter();
  const [state, formAction, pending] = React.useActionState<AuthResult | null, FormData>(signInAction, null);
  const [mobile, setMobile] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [otpMode, setOtpMode] = React.useState(false);
  const [otp, setOtp] = React.useState(""); const [otpSent, setOtpSent] = React.useState(false); const [busy, setBusy] = React.useState(false);
  const [guestBusy, setGuestBusy] = React.useState(false);

  const sendOtp = async () => { setBusy(true); const r = await sendPhoneOtpAction(mobile); setBusy(false); if (r.ok) { setOtpSent(true); toast.success("OTP sent to +91 " + mobile); } else toast.error(r.error); };
  const verify = async () => { setBusy(true); const r = await verifyPhoneOtpAction(mobile, otp); setBusy(false); if (r.ok) router.replace(next ?? r.redirectTo ?? "/"); else toast.error(r.error); };
  const guest = async () => { setGuestBusy(true); const r = await continueAsGuestAction(next); if (r && !r.ok) { toast.error(r.error); setGuestBusy(false); } };
  const fieldErr = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Welcome back</h1>
      <p className="mt-1 text-sm text-ink-3">Sign in with your mobile number to order and track deliveries.</p>
      {confirmed ? <Alert tone="success" className="mt-3">Your account is active. You can sign in now.</Alert> : null}
      {reason === "admin" || reason === "store" ? <Alert tone="info" className="mt-3">{reason === "admin" ? "Sign in with your admin account to open the admin panel." : "Sign in with your store account to open the store dashboard."}</Alert> : null}

      {otpMode ? (
        <div className="mt-5 space-y-4">
          <Input label="Mobile number" inputMode="numeric" leftIcon={<span className="text-sm font-semibold text-ink-3">+91</span>} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" disabled={otpSent} className="pl-12" />
          {otpSent ? <Input label="Enter OTP" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" autoFocus /> : null}
          {otpSent ? <Button fullWidth size="lg" loading={busy} onClick={verify}>Verify & continue</Button> : <Button fullWidth size="lg" loading={busy} onClick={sendOtp} disabled={mobile.length !== 10}>Send OTP</Button>}
          <button type="button" className="w-full text-center text-xs font-semibold text-brand-700" onClick={() => { setOtpMode(false); setOtpSent(false); setOtp(""); }}>Use PIN instead</button>
        </div>
      ) : (
        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <Input name="mobile" type="tel" inputMode="numeric" label="Mobile number" autoComplete="tel-national" required maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} leftIcon={<span className="text-sm font-semibold text-ink-3">+91</span>} className="pl-12" error={fieldErr("mobile")} placeholder="10-digit mobile number" />
          <Input name="password" type={showPw ? "text" : "password"} label="6-digit PIN" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" placeholder="6 digits" autoComplete="current-password" required onInput={(e) => { const t = e.currentTarget; t.value = t.value.replace(/\D/g, "").slice(0, 6); }} leftIcon={<Lock className="h-4 w-4" />} error={fieldErr("password")}
            rightSlot={<button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide PIN" : "Show PIN"} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2">{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>} />
          {state && !state.ok && !state.fieldErrors ? <Alert tone="danger">{state.error}</Alert> : null}
          <Button type="submit" fullWidth size="lg" loading={pending}><Smartphone className="h-4 w-4" /> Sign in</Button>
          <p className="flex justify-between text-xs">
            <Link href="/forgot-password" className="font-semibold text-brand-700">Forgot PIN?</Link>
            {phoneEnabled ? <button type="button" onClick={() => setOtpMode(true)} className="font-semibold text-brand-700">Sign in with OTP</button> : null}
          </p>
        </form>
      )}

      {guestEnabled ? (
        <div className="mt-5">
          <div className="relative my-4 text-center text-xs text-ink-3"><span className="relative z-10 bg-card px-2">or</span><span className="absolute inset-x-0 top-1/2 h-px bg-line" /></div>
          <Button variant="outline" fullWidth size="lg" loading={guestBusy} onClick={guest}><UserRound className="h-4 w-4" /> Continue as guest</Button>
          <p className="mt-2 text-center text-[11px] text-ink-3">No registration needed. Just pick a location and pay.</p>
        </div>
      ) : null}

      <p className="mt-6 text-center text-sm text-ink-3">New to Merta Deal? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700">Create account</Link></p>
    </div>
  );
}
