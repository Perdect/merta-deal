"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, Bell, Languages, UserPlus, Trash2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateProfileAction, createTicketAction } from "@/lib/actions/account";
import type { Profile } from "@/types/app";
import { Button } from "@/components/ui/button";
import { Input, Select, Switch } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { isValidIndianMobile } from "@/lib/utils";

function SettingsCard({ icon, title, description, children, id }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink-3">{description}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ password */
export function PasswordForm({ highlight }: { highlight?: boolean }) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setPassword(""); setConfirm(""); toast.success("Password updated");
  };
  return (
    <SettingsCard icon={<KeyRound className="h-5 w-5" />} title="Change password" description="Use at least 6 characters. You stay signed in on this device.">
      {highlight ? <Alert tone="info" className="mb-3">Set your new password below to finish the reset.</Alert> : null}
      <form onSubmit={submit} className="space-y-3">
        <Input label="New password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <Input label="Confirm new password" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" error={error ?? undefined} />
        <Button type="submit" loading={busy}>Update password</Button>
      </form>
    </SettingsCard>
  );
}

/* --------------------------------------------------------------- preferences */
export type NotificationPrefs = { notify_order_updates: boolean; notify_offers: boolean; whatsapp_opt_in: boolean; language: "en" | "hi" };

export function readPrefs(raw: unknown): NotificationPrefs {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { notify_order_updates: p.notify_order_updates !== false, notify_offers: p.notify_offers !== false, whatsapp_opt_in: p.whatsapp_opt_in === true, language: p.language === "hi" ? "hi" : "en" };
}

export function PreferencesForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [prefs, setPrefs] = React.useState<NotificationPrefs>(() => readPrefs(profile.preferences));
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const canSave = Boolean(profile.full_name && profile.full_name.trim().length >= 2 && profile.phone && isValidIndianMobile(profile.phone));
  const set = <K extends keyof NotificationPrefs>(k: K, v: NotificationPrefs[K]) => { setPrefs((p) => ({ ...p, [k]: v })); setDirty(true); };
  const save = async () => {
    setBusy(true);
    const existing = (profile.preferences && typeof profile.preferences === "object" && !Array.isArray(profile.preferences) ? profile.preferences : {}) as Record<string, unknown>;
    const r = await updateProfileAction({ full_name: profile.full_name ?? "", phone: profile.phone ?? "", avatar_url: profile.avatar_url, preferences: { ...existing, ...prefs } });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setDirty(false); toast.success("Preferences saved"); router.refresh();
  };
  return (
    <>
      <SettingsCard icon={<Bell className="h-5 w-5" />} title="Notification preferences" description="Choose what we send you. Critical order messages (OTP, cancellations) are always delivered.">
        {!canSave ? <Alert tone="warning" className="mb-3">Add your name and mobile number on <Link href="/account" className="font-semibold underline">your profile</Link> to save preferences.</Alert> : null}
        <ul className="divide-y divide-line">
          <li className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-ink">Order updates</p><p className="text-xs text-ink-3">Confirmation, rider assigned, out for delivery</p></div><Switch checked={prefs.notify_order_updates} onChange={(v) => set("notify_order_updates", v)} /></li>
          <li className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-ink">Offers &amp; deals</p><p className="text-xs text-ink-3">Coupons, festival sales, price drops on wishlisted items</p></div><Switch checked={prefs.notify_offers} onChange={(v) => set("notify_offers", v)} /></li>
          <li className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-ink">WhatsApp updates</p><p className="text-xs text-ink-3">Order status on WhatsApp ({profile.phone ? `+91 ${profile.phone}` : "add a mobile number first"})</p></div><Switch checked={prefs.whatsapp_opt_in} onChange={(v) => set("whatsapp_opt_in", v)} disabled={!profile.phone} /></li>
        </ul>
      </SettingsCard>
      <SettingsCard icon={<Languages className="h-5 w-5" />} title="Language / भाषा" description="Preferred language for messages and support replies.">
        <Select aria-label="Language" value={prefs.language} onChange={(e) => set("language", e.target.value === "hi" ? "hi" : "en")} options={[{ value: "en", label: "English" }, { value: "hi", label: "हिन्दी (Hindi)" }]} />
        <p className="mt-2 text-xs text-ink-3">The app interface is currently in English; this preference is used for notifications and support.</p>
      </SettingsCard>
      <Button fullWidth onClick={save} loading={busy} disabled={!dirty || !canSave}>Save preferences</Button>
    </>
  );
}

/* -------------------------------------------------------------- save account */
export function SaveAccountForm({ profile }: { profile: Profile }) {
  const [name, setName] = React.useState(profile.full_name && profile.full_name !== "Guest" ? profile.full_name : "");
  const [phone, setPhone] = React.useState(profile.phone ?? "");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Enter your name";
    if (!isValidIndianMobile(phone)) errs.phone = "Enter a valid 10-digit mobile number";
    if (password.length < 6) errs.password = "Password must be at least 6 characters";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    // Converts the anonymous session into a permanent mobile + password account (phone OTP only when the project requires confirmation).
    const { error } = await createClient().auth.updateUser({ phone: `+91${phone}`, password, data: { full_name: name.trim(), phone } });
    setBusy(false);
    if (error) { toast.error("Could not save your account", error.message); return; }
    setDone(phone);
  };

  if (done) {
    return (
      <SettingsCard id="save-account" icon={<UserPlus className="h-5 w-5" />} title="Account saved">
        <Alert tone="success" icon={<CheckCircle2 className="h-4 w-4" />} title={`You can now sign in with +91 ${done}`}>
          Use this mobile number and your password on any device — your orders, addresses and wallet stay with you. If your number needs verification, enter the SMS code on the sign-in page.
        </Alert>
      </SettingsCard>
    );
  }
  return (
    <SettingsCard id="save-account" icon={<UserPlus className="h-5 w-5" />} title="Save your account" description="You're browsing as a guest. Add your mobile number and a password so you can sign in again and keep your orders, addresses and wallet.">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" />
          <Input label="Mobile number" required inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} error={errors.phone} autoComplete="tel" />
          <Input label="Password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} autoComplete="new-password" wrapperClassName="sm:col-span-2" />
        </div>
        <p className="text-xs text-ink-3">Your mobile number becomes your login.</p>
        <Button type="submit" fullWidth loading={busy}>Save my account</Button>
      </form>
    </SettingsCard>
  );
}

/* ------------------------------------------------------------ delete request */
export function DeleteAccountRequest() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const request = async () => {
    setBusy(true);
    const r = await createTicketAction({ subject: "Account deletion request", category: "account", message: "Please delete my Merta Deal account and personal data. Requested from Settings > Delete account. I understand in-progress orders must be completed or cancelled first." });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setOpen(false); toast.success("Deletion request received", "Our team will confirm on the ticket before deleting.");
    router.push(`/account/support/${r.data}`);
  };
  return (
    <SettingsCard icon={<Trash2 className="h-5 w-5" />} title="Delete account" description="Raises a support ticket. We confirm with you on the ticket, complete any open orders or refunds, then remove your data.">
      <Button variant="outline" className="border-danger/40 text-danger hover:bg-danger-50" onClick={() => setOpen(true)}><Trash2 className="h-4 w-4" /> Request account deletion</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={request} loading={busy} tone="danger" title="Request account deletion?" confirmLabel="Send request" description="This creates a support ticket. Nothing is deleted until our team confirms with you on that ticket. Wallet balance and reward points are forfeited once the account is removed." />
    </SettingsCard>
  );
}
