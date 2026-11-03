"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Pencil } from "lucide-react";
import type { Profile } from "@/types/app";
import { updateProfileAction, requestPhoneChangeAction, verifyPhoneChangeAction } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

/** Name is edited in place; the mobile number is the login and only changes after an OTP. Any email already on file is kept as-is. */
export function ProfileForm({ profile }: { profile: Profile; email?: string | null }) {
  const router = useRouter();
  const [name, setName] = React.useState(profile.full_name ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const dirty = name !== (profile.full_name ?? "");

  const [changing, setChanging] = React.useState(false);
  const [newPhone, setNewPhone] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // A failed save keeps the typed name (and OTP / new number) in place; `saving` / `busy` block
  // a second submit while one is in flight, and a network failure is reported, not swallowed.
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Enter your name";
    setErrors(errs); if (Object.keys(errs).length) return;
    setSaving(true); setSaved(false);
    try {
      const r = await updateProfileAction({ full_name: name.trim(), phone: profile.phone ?? "", avatar_url: profile.avatar_url, email: profile.email ?? null });
      if (!r.ok) { toast.error(r.error); return; }
      setSaved(true); router.refresh();
    } catch {
      toast.error("Could not save your profile", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };
  const sendOtp = async () => {
    if (busy) return;
    setBusy(true);
    try { const r = await requestPhoneChangeAction(newPhone); if (r.ok) { setSent(true); toast.success(`Code sent to +91 ${newPhone}`); } else toast.error(r.error); }
    catch { toast.error("Could not send the code", "Check your connection and try again."); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (busy) return;
    setBusy(true);
    try { const r = await verifyPhoneChangeAction(newPhone, otp); if (r.ok) { toast.success("Mobile number updated"); setChanging(false); setSent(false); setOtp(""); setNewPhone(""); router.refresh(); } else toast.error(r.error); }
    catch { toast.error("Could not verify the code", "Check your connection and try again."); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <Input label="Name" required value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} error={errors.name} autoComplete="name" className="h-12" />
      <div>
        <Input label="Mobile Number" value={profile.phone ? `+91 ${profile.phone}` : "Not set"} readOnly className="h-12 bg-surface text-ink" rightSlot={!changing && env.phoneAuthEnabled ? <button type="button" onClick={() => setChanging(true)} aria-label="Change mobile number" className="tap inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600"><Pencil className="h-3.5 w-3.5" aria-hidden /> Change</button> : undefined} />
        {profile.phone ? <p className="mt-1 flex items-center gap-1 text-xs text-ink-3"><ShieldCheck className="h-3.5 w-3.5 text-success" /> {env.phoneAuthEnabled ? "This is your sign-in number. Changing it needs a code sent to the new number." : "This is your sign-in number. To change it, contact support."}</p> : null}
        {changing ? (
          <div className="mt-3 space-y-3 rounded-xl border border-line bg-surface p-3">
            <Input label="New mobile number" inputMode="numeric" value={newPhone} onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} leftIcon={<span className="text-sm font-semibold text-ink-3">+91</span>} className="pl-12" disabled={sent} />
            {sent ? <Input label="6-digit code" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus /> : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { setChanging(false); setSent(false); setOtp(""); }}>Cancel</Button>
              {sent ? <Button type="button" size="sm" loading={busy} disabled={otp.length !== 6} onClick={verify}>Verify & update</Button> : <Button type="button" size="sm" loading={busy} disabled={newPhone.length !== 10} onClick={sendOtp}>Send code</Button>}
            </div>
          </div>
        ) : null}
      </div>
      <div role="status" aria-live="polite">{saved ? <Alert tone="success">Your profile has been saved.</Alert> : null}</div>
      <div className="flex justify-end"><Button type="submit" size="lg" className="rounded-xl px-10" loading={saving} disabled={saving || !dirty}>Save Changes</Button></div>
    </form>
  );
}
