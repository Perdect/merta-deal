"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
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

/** Cards fanned out on the colour panel: our own category collages, no invented ratings or prices. */
const PANEL_CARDS = [
  { src: "/categories/sweets-collage.webp", title: "Sweets", sub: "Mithai, fresh daily", cls: "-rotate-[9deg] translate-y-6 -translate-x-4 z-0" },
  { src: "/categories/fruits-collage.webp", title: "Fresh fruits", sub: "Picked for Merta City", cls: "z-10 -translate-y-2" },
  { src: "/categories/vegetables-collage.webp", title: "Vegetables", sub: "Sabzi mandi to door", cls: "rotate-[9deg] translate-y-6 translate-x-4 z-0" },
];
const CONFETTI = [
  "left-[8%] top-[18%] h-3 w-3 rounded-full bg-[#ffd166]", "right-[14%] top-[22%] h-2.5 w-2.5 rounded-sm bg-[#06d6a0] rotate-12",
  "left-[16%] bottom-[30%] h-2.5 w-2.5 rounded-full bg-[#b5179e]", "right-[10%] bottom-[34%] h-3 w-3 rounded-sm bg-[#4cc9f0] -rotate-12",
  "left-[46%] top-[12%] h-2 w-2 rounded-full bg-white/80", "right-[30%] top-[10%] h-2.5 w-2.5 rounded-full bg-[#ff6b6b]",
];

/**
 * Admin sign-in as a split screen: a colour panel with fanned category cards and the promise on the
 * left (desktop only), and on the right the logo tile, "Hey! Welcome", the form and a dark Login
 * button. No social sign-in or register link: staff accounts are created by an admin.
 */
function AdminLogin(props: Props) {
  return (
    <div className={cn("theme-admin", "flex min-h-dvh bg-surface")}>
      <PortalTheme portal="admin" />
      <aside className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden bg-brand-600 px-10 text-white md:flex" aria-hidden>
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
        {CONFETTI.map((c) => <span key={c} className={cn("pointer-events-none absolute", c)} />)}
        <div className="relative flex items-end justify-center">
          {PANEL_CARDS.map((c) => (
            <div key={c.src} className={cn("w-[150px] shrink-0 rounded-2xl bg-white p-2 pb-3 text-ink shadow-[0_20px_40px_rgba(0,0,0,0.22)] lg:w-[170px]", c.cls)}>
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-2"><Image src={c.src} alt="" fill sizes="170px" className="object-cover" /></div>
              <p className="mt-2 px-1 text-[14px] font-bold leading-tight">{c.title}</p>
              <p className="px-1 text-[11px] text-ink-3">{c.sub}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex gap-1.5">
          <span className="h-1.5 w-7 rounded-full bg-white" /><span className="h-1.5 w-1.5 rounded-full bg-white/50" /><span className="h-1.5 w-1.5 rounded-full bg-white/50" />
        </div>
        <h2 className="mt-5 text-center font-display text-[30px] font-extrabold leading-tight lg:text-[34px]">Run Merta Deal from one place</h2>
        <p className="mt-2 max-w-sm text-center text-[15px] text-white/85">Orders, packing, riders, payments and the catalogue, all in one admin.</p>
      </aside>

      <main className="flex w-full flex-col items-center justify-center bg-card px-5 py-10 safe-bottom md:w-1/2 md:px-10" style={{ paddingTop: "calc(var(--safe-top) + 2.5rem)" }}>
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.12)] ring-1 ring-line"><LogoMark size={56} /></span>
            <h1 className="mt-5 font-display text-[22px] font-bold text-ink">Hey! Welcome to Merta Deal</h1>
            <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-ink-3"><ShieldCheck className="h-3.5 w-3.5 text-brand-700" aria-hidden />Admin sign-in</p>
          </div>
          <LoginForm {...props} buttonClassName="h-12 rounded-lg bg-ink text-white hover:bg-ink/90" />
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
