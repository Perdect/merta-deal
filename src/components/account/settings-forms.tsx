"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, Bell, Languages, UserPlus, Trash2 } from "lucide-react";
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
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!/^\d{6}$/.test(password)) { setError("PIN must be exactly 6 digits"); return; }
    if (password !== confirm) { setError("PINs do not match"); return; }
    setBusy(true);
    try {
      const { error: err } = await createClient().auth.updateUser({ password });
      if (err) { setError(err.message); return; } // typed PINs stay so the customer can retry
      setPassword(""); setConfirm(""); toast.success("PIN updated");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsCard icon={<KeyRound className="h-5 w-5" />} title="Change PIN" description="6 digits. You stay signed in on this device.">
      {highlight ? <Alert tone="info" className="mb-3">Set your new PIN below to finish the reset.</Alert> : null}
      <form onSubmit={submit} className="space-y-3">
        <Input label="New 6-digit PIN" type="password" inputMode="numeric" required minLength={6} maxLength={6} pattern="[0-9]{6}" value={password} onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="new-password" />
        <Input label="Confirm new PIN" type="password" inputMode="numeric" required minLength={6} maxLength={6} pattern="[0-9]{6}" value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="new-password" error={error ?? undefined} />
        <Button type="submit" loading={busy} disabled={busy}>Update PIN</Button>
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
    if (busy) return;
    setBusy(true);
    const existing = (profile.preferences && typeof profile.preferences === "object" && !Array.isArray(profile.preferences) ? profile.preferences : {}) as Record<string, unknown>;
    try {
      const r = await updateProfileAction({ full_name: profile.full_name ?? "", phone: profile.phone ?? "", avatar_url: profile.avatar_url, preferences: { ...existing, ...prefs } });
      if (!r.ok) { toast.error(r.error); return; } // the switches keep their new positions; Save stays enabled
      setDirty(false); toast.success("Preferences saved"); router.refresh();
    } catch {
      toast.error("Could not save preferences", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SettingsCard icon={<Bell className="h-5 w-5" />} title="Notification preferences" description="Choose what we send you. Critical order messages (OTP, cancellations) are always delivered.">
        {!canSave ? <Alert tone="warning" className="mb-3">Add your name and mobile number on <Link href="/account" className="font-semibold underline">your profile</Link> to save preferences.</Alert> : null}
        <ul className="divide-y divide-line">
          <li className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-ink">Order updates</p><p className="text-xs text-ink-3">Confirmation, rider assigned, out for delivery</p></div><Switch checked={prefs.notify_order_updates} onChange={(v) => set("notify_order_updates", v)} /></li>
          <li className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-ink">Offers &amp; deals</p><p className="text-xs text-ink-3">Coupons, festival sales, price drops</p></div><Switch checked={prefs.notify_offers} onChange={(v) => set("notify_offers", v)} /></li>
          <li className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-ink">WhatsApp updates</p><p className="text-xs text-ink-3">Order status on WhatsApp ({profile.phone ? `+91 ${profile.phone}` : "add a mobile number first"})</p></div><Switch checked={prefs.whatsapp_opt_in} onChange={(v) => set("whatsapp_opt_in", v)} disabled={!profile.phone} /></li>
        </ul>
      </SettingsCard>
      <SettingsCard icon={<Languages className="h-5 w-5" />} title="Language / भाषा" description="Preferred language for messages and support replies.">
        <Select aria-label="Language" value={prefs.language} onChange={(e) => set("language", e.target.value === "hi" ? "hi" : "en")} options={[{ value: "en", label: "English" }, { value: "hi", label: "हिन्दी (Hindi)" }]} />
        <p className="mt-2 text-xs text-ink-3">The app interface is currently in English; this preference is used for notifications and support.</p>
      </SettingsCard>
      <Button fullWidth onClick={save} loading={busy} disabled={busy || !dirty || !canSave}>Save preferences</Button>
    </>
  );
}

/* ------------------------------------------------------------ guest sign-in */
/**
 * A guest has nothing to fill in here: signing in with the mobile number and the code we text is what makes
 * the account, and the guest's cart and addresses move over with it (the sign-in screen sends the guest id along).
 */
export function GuestSignInCard() {
  const pathname = usePathname();
  return (
    <SettingsCard id="save-account" icon={<UserPlus className="h-5 w-5" />} title="Sign in to keep your orders" description="You're browsing as a guest. Sign in with your mobile number and the code we text you; your cart and addresses come with you.">
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="tap flex h-12 w-full items-center justify-center rounded-md bg-brand-600 text-base font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Login with mobile number</Link>
    </SettingsCard>
  );
}

/* ------------------------------------------------------------ delete request */
export function DeleteAccountRequest() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const request = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await createTicketAction({ subject: "Account deletion request", category: "account", message: "Please delete my Merta Deal account and personal data. Requested from Settings > Delete account. I understand in-progress orders must be completed or cancelled first." });
      if (!r.ok) { toast.error(r.error); return; }
      setOpen(false); toast.success("Deletion request received", "Our team will confirm on the ticket before deleting.");
      router.push(`/account/support/${r.data}`);
    } catch {
      toast.error("Could not send the request", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsCard icon={<Trash2 className="h-5 w-5" />} title="Delete account" description="Raises a support ticket. We confirm with you on the ticket, complete any open orders or refunds, then remove your data.">
      <Button variant="outline" className="border-danger/40 text-danger hover:bg-danger-50" onClick={() => setOpen(true)}><Trash2 className="h-4 w-4" /> Request account deletion</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={request} loading={busy} tone="danger" title="Request account deletion?" confirmLabel="Send request" description="This creates a support ticket. Nothing is deleted until our team confirms with you on that ticket. Wallet balance and reward points are forfeited once the account is removed." />
    </SettingsCard>
  );
}
