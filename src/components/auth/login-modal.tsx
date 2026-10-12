"use client";
import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { X, Lock, Zap, ChevronLeft } from "lucide-react";
import { signInAction, type AuthResult } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { Logo } from "@/components/ui/misc";
import { useHydrated } from "@/hooks/use-hydrated";
import { site } from "@/config/site";

/**
 * Phone-first sign-in over the current page: mobile number → PIN. Used from the cart panel so a
 * guest never loses their place. When a guest session exists its id is sent along so the server
 * can carry the guest cart over to the account (merge_guest_cart).
 */
export function LoginModal({ open, onClose, eta, guest, onGuestContinue }: { open: boolean; onClose: () => void; eta: string; guest?: boolean; onGuestContinue?: () => void }) {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const [state, formAction, pending] = React.useActionState<AuthResult | null, FormData>(signInAction, null);
  const [mobile, setMobile] = React.useState("");
  const [step, setStep] = React.useState<"mobile" | "pin">("mobile");
  const [guestId, setGuestId] = React.useState("");

  React.useEffect(() => {
    if (!open || !guest) return;
    createClient().auth.getUser().then(({ data }) => setGuestId(data.user?.id ?? "")).catch(() => {});
  }, [open, guest]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !hydrated) return null;
  const fieldErr = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="absolute inset-0 bg-ink/50 animate-fade-in" onClick={onClose} />
      <div className="relative grid w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card shadow-float animate-slide-up sm:max-w-3xl sm:grid-cols-[1fr_1.1fr] sm:overflow-hidden sm:rounded-2xl">
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-brand-800 via-brand-700 to-brand-500 p-7 text-white sm:flex">
          <Logo size="md" light />
          <div>
            <p className="font-display text-4xl font-extrabold leading-tight">Everything<br />delivered in<br /><span className="text-saffron-300">{eta}</span></p>
            <p className="mt-4 text-sm text-white/80">{site.tagline}</p>
          </div>
          <p className="text-xs text-white/60">{site.city}&apos;s own grocery store, at your door.</p>
        </div>

        <div className="relative px-5 pb-6 pt-6 sm:px-8 sm:py-8">
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-ink-3 hover:bg-surface-2"><X className="h-5 w-5" /></button>
          <h2 className="pr-10 font-display text-2xl font-extrabold leading-tight text-ink">Groceries delivered in <span className="text-brand-700">{eta}</span></h2>

          <form action={formAction} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={pathname} />
            <input type="hidden" name="guestUserId" value={guestId} />
            {step === "mobile" ? (
              <>
                <Input name="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} autoFocus
                  leftIcon={<span className="inline-flex items-center gap-1 text-sm font-bold text-ink"><span aria-hidden>🇮🇳</span>+91</span>} className="h-14 pl-20 text-base" placeholder="Enter Phone Number" aria-label="Mobile number" error={fieldErr("mobile")} />
                <Button type="button" size="lg" fullWidth className="h-13 rounded-xl text-base" disabled={mobile.length !== 10} onClick={() => setStep("pin")}>Continue</Button>
              </>
            ) : (
              <>
                <input type="hidden" name="mobile" value={mobile} />
                <button type="button" onClick={() => setStep("mobile")} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-2"><ChevronLeft className="h-4 w-4" /> +91 {mobile}</button>
                <Input name="password" type="password" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" autoComplete="current-password" required autoFocus onInput={(e) => { const t = e.currentTarget; t.value = t.value.replace(/\D/g, "").slice(0, 6); }}
                  leftIcon={<Lock className="h-4 w-4" />} className="h-14 text-base tracking-[0.3em]" placeholder="6-digit PIN" aria-label="PIN" error={fieldErr("password")} />
                {state && !state.ok && !state.fieldErrors ? <Alert tone="danger">{state.error}</Alert> : null}
                <Button type="submit" size="lg" fullWidth className="h-13 rounded-xl text-base" loading={pending}><Zap className="h-4 w-4" /> Sign in</Button>
                <p className="text-center text-xs"><Link href="/forgot-password" className="font-semibold text-brand-700">Forgot PIN?</Link></p>
              </>
            )}
          </form>

          <p className="mt-4 text-center text-xs text-ink-3">By continuing, you agree to our terms of service and privacy policy.</p>
          <p className="mt-5 text-center text-sm text-ink-3">New to Merta Deal? <Link href={`/register?next=${encodeURIComponent(pathname)}`} className="font-semibold text-brand-700">Create account</Link></p>
          {guest && onGuestContinue ? <button type="button" onClick={onGuestContinue} className="mt-3 w-full text-center text-sm font-semibold text-ink-2 underline-offset-2 hover:underline">Continue as guest instead</button> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
