"use client";
import * as React from "react";
import Link from "next/link";
import { Bike, ShieldCheck } from "lucide-react";
import { submitRiderApplicationAction } from "@/lib/actions/rider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { VEHICLE_OPTIONS } from "./rider-utils";
import { site } from "@/config/site";

/**
 * "Deliver with Merta Deal" application (0047): no account needed. An admin calls to verify, then creates
 * the rider's email + password sign-in from the application.
 */
export function RiderApplyForm() {
  const [f, setF] = React.useState({ fullName: "", phone: "", email: "", vehicle_type: "bike", vehicle_number: "", license_number: "", aadhaar_last4: "", emergency_contact: "", note: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErrors({}); setError(null);
    try {
      const r = await submitRiderApplicationAction(f);
      if (!r.ok) { setErrors(r.fieldErrors ?? {}); setError(r.fieldErrors ? null : r.error); return; }
      setDone(true);
    } catch { setError("Could not send the application. Check your connection and try again."); }
    finally { setBusy(false); }
  };
  if (done) {
    return (
      <Alert tone="success" icon={<ShieldCheck className="h-4 w-4" />} title="Application received">
        We call {f.phone} to verify your details, usually within a day. After that you get your sign-in email and password for the <Link href="/rider/login" className="font-semibold underline">delivery partner login</Link>. Questions? Call {site.supportPhone}.
      </Alert>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-line bg-card p-4 shadow-card sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Full name" required value={f.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" error={errors.fullName} />
        <Input label="Mobile number" required type="tel" inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} autoComplete="tel-national" hint="We call this number to verify you." error={errors.phone} />
      </div>
      <Input label="Email" required type="email" inputMode="email" value={f.email} onChange={(e) => set("email", e.target.value.trim())} autoComplete="email" hint="This becomes your sign-in for the delivery partner app." error={errors.email} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Vehicle type" options={VEHICLE_OPTIONS} value={f.vehicle_type} onChange={(e) => set("vehicle_type", e.target.value)} error={errors.vehicle_type} />
        <Input label="Vehicle number" value={f.vehicle_number} onChange={(e) => set("vehicle_number", e.target.value.toUpperCase())} placeholder="RJ 21 AB 1234" autoCapitalize="characters" hint="Leave blank for a bicycle." error={errors.vehicle_number} />
        <Input label="Driving licence number" value={f.license_number} onChange={(e) => set("license_number", e.target.value)} placeholder="RJ21 20230001234" autoCapitalize="characters" hint="Not needed for a bicycle." error={errors.license_number} />
        <Input label="Aadhaar: last 4 digits (optional)" inputMode="numeric" maxLength={4} value={f.aadhaar_last4} onChange={(e) => set("aadhaar_last4", e.target.value.replace(/\D/g, "").slice(0, 4))} hint="We never ask for the full number." error={errors.aadhaar_last4} />
      </div>
      <Input label="Emergency contact (optional)" type="tel" inputMode="numeric" maxLength={10} value={f.emergency_contact} onChange={(e) => set("emergency_contact", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" error={errors.emergency_contact} />
      <Textarea label="Anything we should know? (optional)" value={f.note} onChange={(e) => set("note", e.target.value.slice(0, 500))} placeholder="e.g. Available evenings only, delivered for Zomato before" />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" size="lg" fullWidth className="h-13 rounded-xl text-base" loading={busy}><Bike className="h-5 w-5" aria-hidden /> Send application</Button>
      <p className="text-center text-xs text-ink-3">No account to create. We verify you by phone, then send your sign-in details.</p>
    </form>
  );
}
