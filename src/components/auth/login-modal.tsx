"use client";
import { notifySessionChanged } from "@/stores/me-store";
import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { X, Lock, Zap, ChevronLeft, Pencil } from "lucide-react";
import { signInAction, sendPhoneOtpAction, verifyPhoneOtpAction, type AuthResult } from "@/lib/actions/auth";
import { env } from "@/lib/env";
import { toast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { LogoMark } from "@/components/ui/misc";
import { InstallButtons } from "@/components/pwa/install-buttons";
import { useHydrated } from "@/hooks/use-hydrated";
import { useDialog } from "@/components/ui/overlay";
import { LoginArt } from "./login-art";
import { OtpInput } from "./otp-input";

/**
 * Phone-first sign-in over the current page: mobile number → PIN. Two panels on larger screens
 * (illustration + form); a bottom sheet with a short illustration banner on phones. Used from the cart panel so a
 * guest never loses their place. When a guest session exists its id is sent along so the server
 * can carry the guest cart over to the account (merge_guest_cart).
 */
export function LoginModal({ open, onClose, onVerified, eta, guest, onGuestContinue, title = "Login to start ordering", defaultMobile }: { open: boolean; onClose: () => void; /** Called instead of `onClose` once the code is accepted, for hosts that carry on with what the customer was doing. */ onVerified?: () => void; eta: string; guest?: boolean; onGuestContinue?: () => void; /** Heading, e.g. "Login to place your order" from the cart. */ title?: string; /** Mobile number already given with the delivery address: pre-filled so it is not typed twice. Pass it as `key` too so a new address refreshes it. */ defaultMobile?: string | null }) {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const [state, formAction, pending] = React.useActionState<AuthResult | null, FormData>(signInAction, null);
  const router = useRouter();
  const [mobile, setMobile] = React.useState(() => { const d = (defaultMobile ?? "").replace(/\D/g, "").slice(-10); return /^[6-9]\d{9}$/.test(d) ? d : ""; });
  // With an SMS provider on the project the sheet is mobile → OTP only, Zepto-style: a new number gets its
  // account on the spot, nothing to create. Without one it is mobile → PIN as before.
  const otpFirst = env.phoneAuthEnabled;
  const [step, setStep] = React.useState<"mobile" | "pin" | "otp">("mobile");
  const [otp, setOtp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const [guestId, setGuestId] = React.useState("");
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendOtp = async () => {
    setBusy(true);
    const r = await sendPhoneOtpAction(mobile);
    setBusy(false);
    if (r.ok) { setOtp(""); setStep("otp"); setCooldown(30); } else toast.error(r.error);
  };
  const verifyOtp = async (code = otp) => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    const r = await verifyPhoneOtpAction(mobile, code, guestId || undefined);
    if (!r.ok) { setBusy(false); toast.error(r.error); return; }
    // Signed in: the chrome reloads its personal data and the page re-renders for the account; the sheet closes with it.
    notifySessionChanged();
    router.refresh();
    (onVerified ?? onClose)();
    setBusy(false);
  };

  // The guest session's id goes along with the sign-in so the server can hand its cart and addresses to the account.
  React.useEffect(() => {
    if (!open) return;
    createClient().auth.getUser().then(({ data }) => setGuestId(data.user?.is_anonymous ? data.user.id : "")).catch(() => {});
  }, [open, guest]);
  // Scroll lock (iOS-safe), Escape, focus trap, focus return and Back-closes-it — shared with Modal.
  const dialogRef = useDialog(open, onClose);
  if (!open || !hydrated) return null;
  const fieldErr = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink/50 animate-fade-in motion-reduce:animate-none" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="login-modal-title" tabIndex={-1} className="relative grid w-full max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-card shadow-float outline-none animate-slide-up motion-reduce:animate-none sm:max-w-3xl sm:grid-cols-[1fr_1.05fr] sm:overflow-hidden sm:rounded-2xl">
        <button type="button" onClick={onClose} aria-label="Close" className="tap absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink-2 shadow-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600 sm:shadow-none"><X className="h-5 w-5" aria-hidden /></button>
        {/* Illustration: a short banner on phones, a full panel beside the form from sm up */}
        <div className="relative h-48 overflow-hidden bg-white sm:h-auto sm:min-h-[460px]">
          <LoginArt className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-x-0 bottom-0 px-4 pb-3 text-center text-white sm:pb-7">
            <p lang="hi" className="font-display text-base font-bold leading-snug sm:text-2xl">मेड़ता की शॉपिंग, अब ऑनलाइन</p>
            <p className="text-xs font-medium text-white/90 sm:mt-1 sm:text-[15px]">Fresh groceries at your door in {eta}</p>
          </div>
        </div>

        <div className="relative px-5 pb-[calc(1.5rem+var(--safe-bottom))] pt-5 sm:px-8 sm:py-8">
          <div className="flex justify-center"><LogoMark size={52} /></div>
          <p className="mt-3 text-center text-xs font-bold uppercase tracking-wide text-brand-700 sm:mt-4">Customer login</p>
          <h2 id="login-modal-title" className="mt-1 text-center font-display text-xl font-bold leading-tight text-ink sm:text-2xl">{step === "otp" ? "OTP Verification" : title}</h2>

          <form action={formAction} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={pathname} />
            <input type="hidden" name="guestUserId" value={guestId} />
            {step === "mobile" ? (
              <>
                <Input name="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} autoFocus
                  leftIcon={<span className="inline-flex items-center gap-1 text-sm font-bold text-ink"><span aria-hidden>🇮🇳</span>+91</span>} className="h-14 pl-20 text-base" placeholder="Enter Phone Number" aria-label="Mobile number" error={fieldErr("mobile")} />
                <Button type="button" size="lg" fullWidth className="h-13 rounded-xl text-base" disabled={mobile.length !== 10} loading={busy} onClick={() => (otpFirst ? void sendOtp() : setStep("pin"))}>{otpFirst ? "Get OTP" : "Continue"}</Button>
              </>
            ) : step === "otp" ? (
              <>
                <p className="flex items-center justify-center gap-1 text-sm text-ink-2">OTP has been sent to <span className="font-semibold text-ink">+91 {mobile}</span>
                  <button type="button" onClick={() => setStep("mobile")} aria-label="Change mobile number" className="tap inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-700 hover:bg-surface-2"><Pencil className="h-4 w-4" aria-hidden /></button></p>
                <OtpInput value={otp} onChange={(v) => { setOtp(v); if (v.length === 6) void verifyOtp(v); }} autoFocus disabled={busy} />
                <Button type="button" size="lg" fullWidth className="h-13 rounded-xl text-base" disabled={otp.length !== 6} loading={busy} onClick={() => void verifyOtp()}>Verify &amp; continue</Button>
                <p className="text-center text-sm text-ink-3">
                  {cooldown > 0 ? <>Resend OTP in <span className="font-semibold text-ink">{cooldown}s</span></> : <button type="button" onClick={() => void sendOtp()} disabled={busy} className="font-semibold text-brand-700">Resend OTP</button>}
                </p>
              </>
            ) : (
              <>
                <input type="hidden" name="mobile" value={mobile} />
                <button type="button" onClick={() => setStep("mobile")} aria-label={`Change mobile number +91 ${mobile}`} className="tap inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ink-2"><ChevronLeft className="h-4 w-4" aria-hidden /> +91 {mobile}</button>
                <Input name="password" type="password" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" autoComplete="current-password" required autoFocus onInput={(e) => { const t = e.currentTarget; t.value = t.value.replace(/\D/g, "").slice(0, 6); }}
                  leftIcon={<Lock className="h-4 w-4" />} className="h-14 text-base tracking-[0.3em]" placeholder="6-digit PIN" aria-label="PIN" error={fieldErr("password")} />
                {state && !state.ok && !state.fieldErrors ? <div role="alert"><Alert tone="danger">{state.error}</Alert></div> : null}
                <Button type="submit" size="lg" fullWidth className="h-13 rounded-xl text-base" loading={pending}><Zap className="h-4 w-4" /> Sign in</Button>
                <p className="flex justify-between text-xs"><Link href="/forgot-password" className="font-semibold text-brand-700">Forgot PIN?</Link>{otpFirst ? <button type="button" onClick={() => void sendOtp()} disabled={busy} className="font-semibold text-brand-700">Sign in with OTP</button> : null}</p>
              </>
            )}
          </form>

          <p className="mt-4 text-center text-xs leading-relaxed text-ink-3">By continuing, you agree to our <Link href="/terms" target="_blank" className="font-semibold text-brand-700 underline underline-offset-2">Terms and Conditions</Link> and <Link href="/privacy" target="_blank" className="font-semibold text-brand-700 underline underline-offset-2">Privacy Policy</Link>.</p>
          {otpFirst ? null : <p className="mt-5 text-center text-sm text-ink-3">New to Merta Deal? <Link href={`/register?next=${encodeURIComponent(pathname)}`} className="font-semibold text-brand-700">Create account</Link></p>}
          {guest && onGuestContinue ? <button type="button" onClick={onGuestContinue} className="mt-1 min-h-11 w-full text-center text-sm font-semibold text-ink-2 underline-offset-2 hover:underline">Continue as guest instead</button> : null}
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-center text-sm font-bold text-ink">Get the app for a better experience</p>
            <InstallButtons className="mt-3 flex flex-wrap justify-center gap-2 space-y-0 [&>p]:hidden" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
