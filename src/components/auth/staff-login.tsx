"use client";
import * as React from "react";
import Link from "next/link";
import { AtSign, Bike, Eye, EyeOff, KeyRound, Lock, LogIn, ShieldCheck, ChevronRight } from "lucide-react";
import { staffSignInAction, requestEmailResetAction, type AuthResult, type StaffPortal } from "@/lib/actions/auth";
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
    intro: "Manage orders, products, riders, payouts and settings.",
    submit: "Sign in to admin",
    denied: "You're signed in with an account that doesn't have admin access. Sign in with an admin account to continue.",
  },
  rider: {
    badge: "Delivery partner",
    Icon: Bike,
    title: "Welcome back",
    intro: "Sign in to see delivery requests, navigate to customers and confirm handovers.",
    submit: "Sign in",
    denied: "That account isn't a Merta Deal delivery partner. Sign in with the email Merta Deal gave you.",
  },
} as const;

type Props = { portal: StaffPortal; next?: string; denied?: boolean; signedOut?: boolean; signedInAs?: string | null };

/**
 * Staff sign-in (admin and delivery partner: email + password). The server
 * admits only accounts holding the portal's role (staffSignInAction). No customer sign-up, guest shopping
 * or cart links here — this page only gets staff into their portal. The rider screen is an app-style
 * green hero with a white sheet; admin keeps the plain card.
 */
export function StaffLogin(props: Props) {
  return props.portal === "rider" ? <RiderLogin {...props} /> : <AdminLogin {...props} />;
}

/** The form itself, shared by both portals: email, password, the error, the button, forgot-password. */
function LoginForm({ portal, next, denied, signedOut, signedInAs, buttonClassName }: Props & { buttonClassName?: string }) {
  const c = COPY[portal];
  const [state, formAction, pending] = React.useActionState<AuthResult | null, FormData>(staffSignInAction, null);
  const [showPin, setShowPin] = React.useState(false);
  // Both portals sign in with the email + password an admin created (Admin → Users / Admin → Riders).
  const [email, setEmail] = React.useState("");
  const [resetState, setResetState] = React.useState<AuthResult | null>(null);
  const [resetBusy, setResetBusy] = React.useState(false);
  const sendReset = async () => { setResetBusy(true); setResetState(await requestEmailResetAction(email)); setResetBusy(false); };
  const fieldErr = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);

  return (
    <>
      {signedOut ? <Alert tone="success" className="mt-4">You&apos;ve signed out.</Alert> : null}
      {denied ? <Alert tone="warning" className="mt-4">{c.denied}{signedInAs ? <> (Currently signed in as {signedInAs}.)</> : null}</Alert> : null}

      <form action={formAction} className="mt-5 space-y-4" noValidate>
        <input type="hidden" name="portal" value={portal} />
        <input type="hidden" name="next" value={next ?? ""} />
        <Input key="email" name="email" type="email" inputMode="email" label="Email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="you@mertadeal.com" leftIcon={<AtSign className="h-4 w-4" />} error={fieldErr("email")} />
        <Input key="email-password" name="password" type={showPin ? "text" : "password"} label="Password" autoComplete="current-password" required leftIcon={<Lock className="h-4 w-4" />} error={fieldErr("password")}
          rightSlot={<button type="button" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? "Hide password" : "Show password"} aria-pressed={showPin} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600">{showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>} />
        {state && !state.ok && !state.fieldErrors ? <Alert tone="danger">{state.error}</Alert> : null}
        <Button type="submit" fullWidth size="lg" loading={pending} className={buttonClassName}><LogIn className="h-4 w-4" aria-hidden /> {c.submit}</Button>
      </form>

      <details className="group mt-5 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600">
          <KeyRound className="h-4 w-4" aria-hidden /> Forgot your password?
        </summary>
        <div className="mt-2 space-y-2 text-ink-2">
          <p>Enter the email you sign in with above, and we email you a link to choose a new password.</p>
          <Button type="button" variant="outline" size="sm" onClick={sendReset} loading={resetBusy} disabled={!email.includes("@")}>Email me a reset link</Button>
          {resetState ? <Alert tone={resetState.ok ? "success" : "warning"}>{resetState.ok ? resetState.message : resetState.error}</Alert> : null}
          {portal === "admin"
            ? <p className="text-xs text-ink-3">A super admin can also reset it for you under <span className="font-semibold">Admin → Users → open the account → Reset PIN</span>.</p>
            : <p className="text-xs text-ink-3">No email access? Call Merta Deal on <a href={`tel:${site.supportPhone.replace(/\s/g, "")}`} className="font-semibold text-brand-700 underline">{site.supportPhone}</a> and an admin resets it for you.</p>}
        </div>
      </details>
    </>
  );
}

function AdminLogin(props: Props) {
  const c = COPY.admin;
  return (
    <div className={cn("theme-admin", "flex min-h-dvh flex-col bg-surface")}>
      <PortalTheme portal="admin" />
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
          <LoginForm {...props} />
        </div>
      </main>
    </div>
  );
}

/**
 * Rider sign-in as an app screen: a deep-green hero (logo tile, app name, tagline, soft rings) and a white
 * sheet with rounded top corners that carries the form. Looks like the installed app before sign-in.
 */
function RiderLogin(props: Props) {
  const c = COPY.rider;
  return (
    <div className={cn("theme-rider", "flex min-h-dvh flex-col bg-brand-700")}>
      <PortalTheme portal="rider" />
      <header className="relative overflow-hidden text-white" style={{ paddingTop: "var(--safe-top)" }}>
        <HeroRings />
        <div className="relative mx-auto w-full max-w-md px-6 pb-14 pt-10">
          <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-white shadow-lg shadow-black/10"><LogoMark size={44} /></span>
          <p className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-white/25"><Bike className="h-3.5 w-3.5" aria-hidden />{c.badge}</p>
          <h1 className="mt-2 font-display text-[30px] font-extrabold leading-tight">MD Rider</h1>
          <p className="mt-1 text-[14px] text-white/80">{site.tagline}</p>
        </div>
      </header>

      <main className="-mt-6 flex-1 rounded-t-[28px] bg-surface safe-bottom">
        <div className="mx-auto w-full max-w-md px-5 pb-8 pt-7">
          <h2 className="font-display text-[22px] font-extrabold text-ink">{c.title}</h2>
          <p className="mt-1 text-[13px] text-ink-3">{c.intro}</p>
          <LoginForm {...props} buttonClassName="h-13 rounded-xl text-base" />
          <Link href="/deliver" className="mt-6 flex items-center gap-3 rounded-[20px] bg-card p-4 shadow-card active:scale-[0.99]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Bike className="h-5 w-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-ink">Not a delivery partner yet?</span>
              <span className="block text-[12px] text-ink-3">Apply to deliver with Merta Deal</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
          </Link>
        </div>
      </main>
    </div>
  );
}

/** Soft concentric rings in the hero corner, drawn once, no image request. */
function HeroRings() {
  return (
    <svg className="pointer-events-none absolute -right-16 -top-10 h-64 w-64 text-white/10" viewBox="0 0 200 200" fill="none" aria-hidden>
      {[30, 55, 80, 105, 130].map((r) => <circle key={r} cx="100" cy="100" r={r} stroke="currentColor" strokeWidth="1.5" />)}
      <circle cx="100" cy="100" r="12" fill="currentColor" />
    </svg>
  );
}
