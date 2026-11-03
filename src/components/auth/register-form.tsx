"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, UserRound, Eye, EyeOff, ShoppingBasket } from "lucide-react";
import { signUpAction, verifySignupOtpAction, type AuthResult } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { safeNext } from "@/lib/safe-next";

/** Fields rise in one after another; `motion-safe` keeps them still for reduced-motion users. */
const rise = (i: number) => ({ className: "motion-safe:animate-rise", style: { animationDelay: `${180 + i * 70}ms` } });

/** Customer sign-up: name + mobile number + 6-digit PIN (no email). Riders are approved by the admin. */
export function RegisterForm({ next }: { next?: string }) {
  const router = useRouter();
  const [state, formAction, pending] = React.useActionState<AuthResult | null, FormData>(signUpAction, null);
  const [mobile, setMobile] = React.useState(""); const [showPw, setShowPw] = React.useState(false);
  const [otp, setOtp] = React.useState(""); const [busy, setBusy] = React.useState(false);
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);

  if (state?.ok && state.redirectTo?.startsWith("verify:")) {
    const m = state.redirectTo.slice(7);
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-ink">Verify your mobile</h1>
        <Alert tone="success">{state.message}</Alert>
        <Input label="6-digit code" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus />
        <Button fullWidth size="lg" loading={busy} onClick={async () => { setBusy(true); const r = await verifySignupOtpAction(m, otp); setBusy(false); if (r.ok) router.replace(safeNext(next, r.redirectTo ?? "/")); else toast.error(r.error); }}>Activate account</Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div {...rise(0)}>
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 motion-safe:animate-pop"><ShoppingBasket className="h-6 w-6" /></span>
        <h1 className="font-display text-2xl font-extrabold text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-ink-3">Just your name, mobile number and a 6-digit PIN.</p>
      </div>
      <input type="hidden" name="next" value={next ?? ""} />
      <div {...rise(1)}><Input name="fullName" label="Full name" required autoComplete="name" leftIcon={<UserRound className="h-4 w-4" />} error={err("fullName")} /></div>
      <div {...rise(2)}><Input name="mobile" type="tel" label="Mobile number" required inputMode="numeric" autoComplete="tel-national" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} leftIcon={<span className="text-sm font-semibold text-ink-3">+91</span>} className="pl-12" error={err("mobile")} placeholder="10-digit mobile number" hint="This is your login. We never share it." /></div>
      <div {...rise(3)}><Input name="password" type={showPw ? "text" : "password"} label="Choose a 6-digit PIN" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" placeholder="6 digits" required autoComplete="new-password" onInput={(e) => { const t = e.currentTarget; t.value = t.value.replace(/\D/g, "").slice(0, 6); }} leftIcon={<Lock className="h-4 w-4" />} error={err("password")} hint="Exactly 6 digits — you'll use it to sign in."
        rightSlot={<button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide PIN" : "Show PIN"} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2">{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>} /></div>
      {state && !state.ok && !state.fieldErrors ? <Alert tone="danger">{state.error}</Alert> : null}
      <div {...rise(4)}><Button type="submit" fullWidth size="lg" className="h-13 rounded-xl text-base transition-transform active:scale-[0.98]" loading={pending}>Create account</Button></div>
      <p className="text-center text-sm text-ink-3 motion-safe:animate-fade-in" style={{ animationDelay: "520ms" }}>Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700">Sign in</Link></p>
    </form>
  );
}
