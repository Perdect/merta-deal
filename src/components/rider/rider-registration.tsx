"use client";
import * as React from "react";
import Link from "next/link";
import { Bike, ShieldCheck } from "lucide-react";
import { registerRiderAction, type RiderFormResult } from "@/lib/actions/rider";
import { signOutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { LogoMark } from "@/components/ui/misc";
import { VEHICLE_OPTIONS } from "./rider-utils";

/** Full-screen "complete registration" page for a signed-in user with no delivery_partners row. */
export function RiderRegistration({ name }: { name: string | null }) {
  const [state, action, pending] = React.useActionState<RiderFormResult | null, FormData>(registerRiderAction, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex h-14 items-center gap-2 border-b border-line bg-card px-4" style={{ paddingTop: "var(--safe-top)" }}>
        <LogoMark size={30} /><span className="font-display text-base font-extrabold text-ink">Merta<span className="text-fresh">Deal</span> <span className="text-ink-3">Rider</span></span>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 safe-bottom">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Bike className="h-6 w-6" /></span>
          <div>
            <h1 className="font-display text-xl font-extrabold text-ink">Complete rider registration</h1>
            <p className="mt-1 text-sm text-ink-3">{name ? `${name}, tell` : "Tell"} us about your vehicle and documents. An admin verifies these before activating your account.</p>
          </div>
        </div>

        {state?.ok ? (
          <Alert tone="success" icon={<ShieldCheck className="h-4 w-4" />} title="Submitted">{state.message} <Link href="/rider" className="font-semibold underline">Continue</Link></Alert>
        ) : (
          <form action={action} className="space-y-4 rounded-lg border border-line bg-card p-4 shadow-card">
            <Select name="vehicle_type" label="Vehicle type" options={VEHICLE_OPTIONS} defaultValue="bike" required error={fe.vehicle_type} />
            <Input name="vehicle_number" label="Vehicle number" placeholder="RJ 21 AB 1234" autoCapitalize="characters" hint="Leave blank for a bicycle." error={fe.vehicle_number} />
            <Input name="license_number" label="Driving licence number" placeholder="RJ21 20230001234" autoCapitalize="characters" hint="Not needed for a bicycle." error={fe.license_number} />
            <Input name="aadhaar_last4" label="Aadhaar — last 4 digits" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="1234" required hint="We never store your full Aadhaar number." error={fe.aadhaar_last4} />
            <Input name="emergency_contact" label="Emergency contact (mobile)" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} placeholder="98290 12345" required error={fe.emergency_contact} />
            {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}
            <Button type="submit" size="lg" fullWidth loading={pending}>Submit for approval</Button>
          </form>
        )}

        <form action={signOutAction} className="mt-6 text-center">
          <Button type="submit" variant="link" className="text-ink-3">Sign out</Button>
        </form>
      </main>
    </div>
  );
}
