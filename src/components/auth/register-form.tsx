"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, UserRound, Store, Bike, ShoppingBasket, Eye, EyeOff } from "lucide-react";
import { signUpAction, verifySignupOtpAction, type AuthResult } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const ROLES = [{ v: "customer", label: "Customer", icon: ShoppingBasket, hint: "Order groceries" }, { v: "store_owner", label: "Kirana store", icon: Store, hint: "Sell on Merta Deal" }, { v: "rider", label: "Delivery partner", icon: Bike, hint: "Earn per delivery" }] as const;

/** Create an account with name + mobile number + password (no email). */
export function RegisterForm({ next, initialRole }: { next?: string; initialRole?: string }) {
  const router = useRouter();
  const [role, setRole] = React.useState<(typeof ROLES)[number]["v"]>(ROLES.some((r) => r.v === initialRole) ? (initialRole as (typeof ROLES)[number]["v"]) : "customer");
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
        <Button fullWidth size="lg" loading={busy} onClick={async () => { setBusy(true); const r = await verifySignupOtpAction(m, otp); setBusy(false); if (r.ok) router.replace(next ?? r.redirectTo ?? "/"); else toast.error(r.error); }}>Activate account</Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div><h1 className="text-xl font-bold text-ink">Create your account</h1><p className="mt-1 text-sm text-ink-3">Just your name, mobile number and a password.</p></div>
      <input type="hidden" name="next" value={next ?? ""} /><input type="hidden" name="role" value={role} />
      <div className="grid grid-cols-3 gap-2">
        {ROLES.map(({ v, label, icon: Icon, hint }) => <button key={v} type="button" onClick={() => setRole(v)} className={cn("flex flex-col items-center gap-1 rounded-md border p-2.5 text-center", role === v ? "border-brand-600 bg-brand-50" : "border-line bg-card")}><Icon className={cn("h-5 w-5", role === v ? "text-brand-700" : "text-ink-3")} /><span className="text-xs font-bold text-ink">{label}</span><span className="text-[10px] text-ink-3">{hint}</span></button>)}
      </div>
      <Input name="fullName" label="Full name" required autoComplete="name" leftIcon={<UserRound className="h-4 w-4" />} error={err("fullName")} />
      <Input name="mobile" type="tel" label="Mobile number" required inputMode="numeric" autoComplete="tel-national" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} leftIcon={<span className="text-sm font-semibold text-ink-3">+91</span>} className="pl-12" error={err("mobile")} placeholder="10-digit mobile number" hint="This is your login. We never share it." />
      <Input name="password" type={showPw ? "text" : "password"} label="Password" required autoComplete="new-password" leftIcon={<Lock className="h-4 w-4" />} error={err("password")} hint="At least 6 characters"
        rightSlot={<button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2">{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>} />
      {state && !state.ok && !state.fieldErrors ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" fullWidth size="lg" loading={pending}>{role === "customer" ? "Create account" : role === "store_owner" ? "Register store account" : "Apply as rider"}</Button>
      {role !== "customer" ? <p className="text-center text-xs text-ink-3">{role === "store_owner" ? "After sign up, complete your store profile & documents. Admin approval takes 1 working day." : "After sign up, complete your vehicle details. You go live after admin verification."}</p> : null}
      <p className="text-center text-sm text-ink-3">Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700">Sign in</Link></p>
    </form>
  );
}
