"use client";
import { notifySessionChanged } from "@/stores/me-store";
import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, Pencil } from "lucide-react";
import { sendPhoneOtpAction, verifyPhoneOtpAction } from "@/lib/actions/auth";
import { env } from "@/lib/env";
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
 * Sign-in over the current page: mobile number → the 6-digit code sent to it, and nothing else. A number
 * seen for the first time gets its account when the code is checked, so there is no sign-up, no PIN and no
 * guest button. Two panels on larger screens (illustration + form); a bottom sheet with a short illustration
 * banner on phones. Used from the cart panel so nobody loses their place: a guest session's id is sent along
 * and the server carries its cart and addresses over to the account (merge_guest_cart). Errors are the
 * server's own and stay on the card.
 */
export function LoginModal({ open, onClose, onVerified, eta, title = "Login to start ordering", defaultMobile }: { open: boolean; onClose: () => void; /** Called instead of `onClose` once the code is accepted, for hosts that carry on with what the customer was doing. */ onVerified?: () => void; eta: string; /** Heading, e.g. "Login to place your order" from the cart. */ title?: string; /** Mobile number already given with the delivery address: pre-filled so it is not typed twice. Pass it as `key` too so a new address refreshes it. */ defaultMobile?: string | null }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [mobile, setMobile] = React.useState(() => { const d = (defaultMobile ?? "").replace(/\D/g, "").slice(-10); return /^[6-9]\d{9}$/.test(d) ? d : ""; });
  const [step, setStep] = React.useState<"mobile" | "otp">("mobile");
  const [otp, setOtp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);
  const [guestId, setGuestId] = React.useState("");
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
    if (r.ok) { setOtp(""); setStep("otp"); setCooldown(30); } else setError(r.error);
  };
  const verifyOtp = async (code = otp) => {
    if (code.length !== 6 || busy) return;
    setBusy(true); setError(null);
    const r = await verifyPhoneOtpAction(mobile, code, guestId || undefined);
    if (!r.ok) { setBusy(false); setOtp(""); setError(r.error); return; }
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
  }, [open]);
  // Scroll lock (iOS-safe), Escape, focus trap, focus return and Back-closes-it — shared with Modal.
  const dialogRef = useDialog(open, onClose);
  if (!open || !hydrated) return null;

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

          {step === "mobile" ? (
            <form className="mt-6 space-y-3" onSubmit={(e) => { e.preventDefault(); void sendOtp(); }} noValidate>
              <Input name="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={mobile} onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(null); }} autoFocus
                leftIcon={<span className="inline-flex items-center gap-1 text-sm font-bold text-ink"><span aria-hidden>🇮🇳</span>+91</span>} className="h-14 pl-20 text-base" placeholder="Enter Phone Number" aria-label="Mobile number" disabled={!env.phoneAuthEnabled} />
              {env.phoneAuthEnabled ? null : <Alert tone="warning">Sign-in by OTP is not switched on for this site yet.</Alert>}
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <Button type="submit" size="lg" fullWidth className="h-13 rounded-xl text-base" disabled={mobile.length !== 10 || !env.phoneAuthEnabled} loading={busy}>Continue</Button>
            </form>
          ) : (
            <div className="mt-6 space-y-4">
              <p className="flex flex-wrap items-center justify-center gap-1 text-sm text-ink-2">OTP has been sent to <span className="font-semibold text-ink">+91 {mobile}</span>
                <button type="button" onClick={() => { setStep("mobile"); setOtp(""); setError(null); }} aria-label="Change mobile number" className="tap inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-700 hover:bg-surface-2"><Pencil className="h-4 w-4" aria-hidden /></button></p>
              <OtpInput value={otp} onChange={(v) => { setOtp(v); setError(null); if (v.length === 6) void verifyOtp(v); }} autoFocus disabled={busy} />
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <Button type="button" size="lg" fullWidth className="h-13 rounded-xl text-base" disabled={otp.length !== 6} loading={busy} onClick={() => void verifyOtp()}>Verify &amp; continue</Button>
              <p className="text-center text-sm text-ink-3" aria-live="polite">
                {cooldown > 0 ? <>Resend OTP in <span className="font-semibold tabular-nums text-ink">{cooldown}s</span></> : <button type="button" onClick={() => void sendOtp()} disabled={busy} className="tap min-h-11 font-semibold text-brand-700">Resend OTP</button>}
              </p>
            </div>
          )}

          <p className="mt-4 text-center text-xs leading-relaxed text-ink-3">By continuing, you agree to our <Link href="/terms" target="_blank" className="font-semibold text-brand-700 underline underline-offset-2">Terms and Conditions</Link> and <Link href="/privacy" target="_blank" className="font-semibold text-brand-700 underline underline-offset-2">Privacy Policy</Link>.</p>
          <p className="mt-2 text-center text-xs text-ink-3">New here? The same step creates your account.</p>
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
