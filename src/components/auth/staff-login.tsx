"use client";
import * as React from "react";
import Link from "next/link";
import { Bike, Eye, EyeOff, KeyRound, Lock, LogIn, ShieldCheck } from "lucide-react";
import { staffSignInAction, type AuthResult, type StaffPortal } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { LogoMark } from "@/components/ui/misc";
import { PortalTheme } from "@/components/shared/portal-theme";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

const COPY = {
  admin: {
    badge: "Admin",
    Icon: ShieldCheck,
    title: "Admin login",
    intro: "Manage orders, stores, riders, payouts and settings.",
    submit: "Sign in to admin",
    denied: "You're signed in with an account that doesn't have admin access. Sign in with an admin account to continue.",
  },
  rider: {
    badge: "Delivery partner",
    Icon: Bike,
    title: "Delivery partner login",
    intro: "See delivery requests, navigate to customers and confirm handovers.",
    submit: "Sign in as delivery partner",
    denied: "That account isn't a Merta Deal delivery partner. Sign in with your delivery partner number.",
  },
} as const;

/**
 * Staff sign-in (admin / delivery partner). Same mobile + PIN accounts as everywhere else, but the server
 * admits only accounts holding the portal's role (staffSignInAction). No customer sign-up, guest shopping
 * or cart links here — this page only gets staff into their portal.
 */
export function StaffLogin({ portal, next, denied, signedOut, signedInAs }: { portal: StaffPortal; next?: string; denied?: boolean; signedOut?: boolean; signedInAs?: string | null }) {
  const c = COPY[portal];
  const [state, formAction, pending] = React.useActionState<AuthResult | null, FormData>(staffSignInAction, null);
  const [mobile, setMobile] = React.useState("");
  const [showPin, setShowPin] = React.useState(false);
  const fieldErr = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);

  return (
    <div className={cn(`theme-${portal}`, "flex min-h-dvh flex-col bg-surface")}>
      <PortalTheme portal={portal} />
      <header className="border-b border-line bg-card" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          <LogoMark size={30} />
          <span className="font-display text-base font-extrabold text-ink">Merta<span className="text-[#329537]">Deal</span></span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-200">
            <c.Icon className="h-3.5 w-3.5" aria-hidden />{c.badge}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8 safe-bottom">
        <div className="rounded-lg border border-line bg-card p-5 shadow-card sm:p-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><c.Icon className="h-6 w-6" aria-hidden /></span>
          <h1 className="mt-3 font-display text-2xl font-extrabold text-ink">{c.title}</h1>
          <p className="mt-1 text-sm text-ink-3">{c.intro}</p>

          {signedOut ? <Alert tone="success" className="mt-4">You&apos;ve signed out.</Alert> : null}
          {denied ? <Alert tone="warning" className="mt-4">{c.denied}{signedInAs ? <> (Currently signed in as {signedInAs}.)</> : null}</Alert> : null}

          <form action={formAction} className="mt-5 space-y-4" noValidate>
            <input type="hidden" name="portal" value={portal} />
            <input type="hidden" name="next" value={next ?? ""} />
            <Input name="mobile" type="tel" inputMode="numeric" label="Mobile number" autoComplete="username" required maxLength={10}
              value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              leftIcon={<span className="text-sm font-semibold text-ink-3">+91</span>} className="pl-12" placeholder="10-digit mobile number" error={fieldErr("mobile")} />
            <Input name="password" type={showPin ? "text" : "password"} label="6-digit PIN" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" placeholder="6 digits" autoComplete="current-password" required
              onInput={(e) => { const t = e.currentTarget; t.value = t.value.replace(/\D/g, "").slice(0, 6); }} leftIcon={<Lock className="h-4 w-4" />} error={fieldErr("password")}
              rightSlot={<button type="button" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? "Hide PIN" : "Show PIN"} aria-pressed={showPin} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600">{showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>} />
            {state && !state.ok && !state.fieldErrors ? <Alert tone="danger">{state.error}</Alert> : null}
            <Button type="submit" fullWidth size="lg" loading={pending}><LogIn className="h-4 w-4" aria-hidden /> {c.submit}</Button>
          </form>

          <details className="group mt-5 rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm">
            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600">
              <KeyRound className="h-4 w-4" aria-hidden /> Forgot your PIN?
            </summary>
            {portal === "admin" ? (
              <p className="mt-2 text-ink-2">
                Admin PINs are reset by a super admin: <span className="font-semibold">Admin → Users → open the account → Reset PIN</span>. They share the new PIN with you in person or by phone; change it afterwards in your account settings.
                {" "}If no super admin is available, email <a href={`mailto:${site.supportEmail}`} className="font-semibold text-brand-700 underline">{site.supportEmail}</a>.
              </p>
            ) : (
              <p className="mt-2 text-ink-2">
                Call Merta Deal on <a href={`tel:${site.supportPhone.replace(/\s/g, "")}`} className="font-semibold text-brand-700 underline">{site.supportPhone}</a>. After confirming it&apos;s you, an admin sets a new PIN for your delivery partner account.
              </p>
            )}
          </details>
        </div>

        {portal === "rider" ? (
          <p className="mt-5 text-center text-sm text-ink-3">
            Not a delivery partner yet? <Link href="/deliver" className="font-semibold text-brand-700 underline-offset-2 hover:underline">Deliver with Merta Deal</Link>
          </p>
        ) : null}
      </main>
    </div>
  );
}
