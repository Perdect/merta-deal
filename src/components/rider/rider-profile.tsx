"use client";
import * as React from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Bell, CheckCheck, LifeBuoy, LogOut, Info, Phone, Mail, ShieldCheck } from "lucide-react";
import type { DeliveryPartner, Notification } from "@/types/app";
import { updateRiderProfileAction, markRiderNotificationsReadAction, type RiderFormResult } from "@/lib/actions/rider";
import { staffSignOutAction } from "@/lib/actions/auth";
import { useNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/states";
import { Avatar, StarRating } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { useRiderStore } from "./rider-store";
import { VEHICLE_OPTIONS } from "./rider-utils";

type ProfileUser = { id: string; name: string | null; phone: string | null; email: string | null; avatarUrl: string | null };
const STATUS_TONE = { active: "success", pending: "warning", suspended: "danger" } as const;

export function RiderProfile({ user, rider: initialRider, notifications }: { user: ProfileUser; rider: DeliveryPartner; notifications: Notification[] }) {
  const rider = useRiderStore((s) => s.rider) ?? initialRider;
  const [state, action, pending] = React.useActionState<RiderFormResult | null, FormData>(updateRiderProfileAction, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  React.useEffect(() => { if (state?.ok) toast.success(state.message ?? "Saved"); }, [state]);

  return (
    <div className="space-y-4">
      <section className="flex items-center gap-3 rounded-lg border border-line bg-card p-4 shadow-card">
        <Avatar name={user.name} src={user.avatarUrl} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h1 className="truncate font-display text-lg font-extrabold text-ink">{user.name ?? "Delivery partner"}</h1><Badge tone={STATUS_TONE[rider.status]} size="xs" className="capitalize">{rider.status}</Badge></div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
            {user.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{user.phone}</span> : null}
            {user.email ? <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{user.email}</span> : null}
          </p>
          <p className="mt-1 flex items-center gap-3 text-xs text-ink-2"><StarRating value={rider.rating_avg} count={rider.rating_count} /><span>{formatNumber(rider.total_deliveries)} deliveries</span></p>
        </div>
      </section>

      <form action={action} className="space-y-4 rounded-lg border border-line bg-card p-4 shadow-card" aria-labelledby="vehicle-head">
        <h2 id="vehicle-head" className="text-sm font-bold text-ink">Vehicle &amp; documents</h2>
        <Select name="vehicle_type" label="Vehicle type" options={VEHICLE_OPTIONS} defaultValue={rider.vehicle_type} required error={fe.vehicle_type} />
        <Input name="vehicle_number" label="Vehicle number" defaultValue={rider.vehicle_number ?? ""} placeholder="RJ 21 AB 1234" autoCapitalize="characters" error={fe.vehicle_number} />
        <Input name="license_number" label="Driving licence number" defaultValue={rider.license_number ?? ""} placeholder="RJ21 20230001234" autoCapitalize="characters" error={fe.license_number} />
        {rider.aadhaar_last4 ? (
          <div className="space-y-1.5"><p className="text-sm font-medium text-ink-2">Aadhaar</p><p className="flex h-11 items-center gap-2 rounded-sm border border-line bg-surface-2 px-3.5 text-sm text-ink-2"><ShieldCheck className="h-4 w-4 text-brand-600" /> •••• •••• {rider.aadhaar_last4} <span className="text-xs text-ink-3">(verified by admin — contact support to change)</span></p></div>
        ) : (
          <Input name="aadhaar_last4" label="Aadhaar — last 4 digits" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="1234" hint="Needed for approval. We never store the full number." error={fe.aadhaar_last4} />
        )}
        <Input name="emergency_contact" label="Emergency contact (mobile)" defaultValue={rider.emergency_contact ?? ""} inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} placeholder="98290 12345" error={fe.emergency_contact} />
        {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}
        <Button type="submit" size="lg" fullWidth loading={pending}>Save changes</Button>
        <p className="text-xs text-ink-3">Account status, rating and totals are managed by the Merta Deal team and can&apos;t be edited here.</p>
      </form>

      <NotificationsSection userId={user.id} initial={notifications} />

      <section className="rounded-lg border border-line bg-card p-4 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Info className="h-4 w-4 text-info" /> About location tracking</h2>
        <p className="mt-2 text-sm text-ink-2">While you&apos;re online or on a delivery, this app streams your real GPS position every few seconds so Merta Deal and the customer can see you. Browsers only allow this while Merta Deal is open on screen — if you switch apps or lock the phone, updates pause until you come back. Continuous background tracking needs the native app wrapper, which isn&apos;t part of this web app yet.</p>
        <p className="mt-2 text-xs text-ink-3">Tip: add Merta Deal to your home screen and keep it open during deliveries. The screen stays awake automatically while you&apos;re on a trip.</p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/account/support" className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-line-2 bg-card px-4 text-sm font-semibold text-ink active:scale-[0.98]"><LifeBuoy className="h-5 w-5 text-brand-600" /> Support</Link>
        <form action={staffSignOutAction} className="contents"><input type="hidden" name="portal" value="rider" /><SignOutButton /></form>
      </div>
    </div>
  );
}

/** Submit button for the sign-out form: shows the pending state so a second tap can't fire the action twice. */
function SignOutButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="outline" size="lg" className="text-danger" loading={pending}><LogOut className="h-5 w-5" /> {pending ? "Signing out…" : "Sign out"}</Button>;
}

function NotificationsSection({ userId, initial }: { userId: string; initial: Notification[] }) {
  const { items, unread, setItems } = useNotifications(userId, initial, { toastNew: false });
  const [busy, setBusy] = React.useState(false);
  const markAll = async () => {
    if (busy) return;
    setBusy(true);
    const r = await markRiderNotificationsReadAction();
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setItems((cur) => cur.map((n) => ({ ...n, is_read: true })));
  };
  return (
    <section className="rounded-lg border border-line bg-card shadow-card" aria-labelledby="notif-head">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 id="notif-head" className="flex items-center gap-2 text-sm font-bold text-ink"><Bell className="h-4 w-4" /> Notifications{unread ? <Badge tone="saffron" size="xs">{unread} new</Badge> : null}</h2>
        {unread ? <Button variant="ghost" size="xs" onClick={markAll} loading={busy}><CheckCheck className="h-4 w-4" /> Mark all read</Button> : null}
      </div>
      {items.length === 0 ? <EmptyState compact title="No notifications yet" description="Delivery requests and updates will appear here." /> : (
        <ul className="divide-y divide-line">
          {items.slice(0, 20).map((n) => (
            <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.is_read && "bg-brand-50/60")}>
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-brand-600")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm text-ink", !n.is_read && "font-semibold")}>{n.title}</p>
                <p className="text-xs text-ink-2">{n.body}</p>
                <p className="mt-0.5 text-[11px] text-ink-3">{timeAgo(n.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
