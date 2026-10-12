"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resetPasswordAction, verifyPhoneOtpAction, type AuthResult } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { site } from "@/config/site";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [state, action, pending] = React.useActionState<AuthResult | null, FormData>(resetPasswordAction, null);
  const [mobile, setMobile] = React.useState(""); const [otp, setOtp] = React.useState(""); const [busy, setBusy] = React.useState(false);
  const verifying = state?.ok && state.redirectTo?.startsWith("verify:");
  return (
    <form action={action} className="space-y-4">
      <div><h1 className="text-xl font-bold text-ink">Reset PIN</h1><p className="mt-1 text-sm text-ink-3">We&apos;ll send a one-time code to your mobile number.</p></div>
      <Input name="mobile" type="tel" inputMode="numeric" label="Mobile number" required maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} leftIcon={<span className="text-sm font-semibold text-ink-3">+91</span>} className="pl-12" disabled={Boolean(verifying)} />
      {state ? <Alert tone={state.ok ? "success" : "warning"}>{state.ok ? state.message : <>{state.error} Call {site.supportPhone} or WhatsApp us and we&apos;ll help you sign in.</>}</Alert> : null}
      {verifying ? (
        <>
          <Input label="6-digit code" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus />
          <Button type="button" fullWidth loading={busy} onClick={async () => { setBusy(true); const r = await verifyPhoneOtpAction(mobile, otp); setBusy(false); if (r.ok) router.replace("/account/settings?reset=1"); else toast.error(r.error); }}>Verify & set new PIN</Button>
        </>
      ) : <Button type="submit" fullWidth loading={pending}>Send code</Button>}
      <p className="text-center text-sm"><Link href="/login" className="font-semibold text-brand-700">Back to sign in</Link></p>
    </form>
  );
}
