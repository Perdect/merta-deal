"use client";
import * as React from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Bell, CheckCheck, LifeBuoy, LogOut, Phone, Mail, ShieldCheck, Languages, Pencil, MapPin, ChevronDown, Bike } from "lucide-react";
import type { DeliveryPartner, Notification } from "@/types/app";
import { updateRiderProfileAction, markRiderNotificationsReadAction, type RiderFormResult } from "@/lib/actions/rider";
import { staffSignOutAction } from "@/lib/actions/auth";
import { useNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/states";
import { Avatar, StarRating } from "@/components/ui/misc";
import { BottomSheet } from "@/components/ui/overlay";
import { AlertSetup, type PushConfig } from "@/components/alerts/alert-setup";
import { toast } from "@/components/ui/toast";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { useRiderStore } from "./rider-store";
import { InstallCard } from "./install-card";
import { LangToggle, GpsIndicator } from "./rider-shell";
import { useT, type TKey } from "@/lib/rider-i18n";
import type { Enums } from "@/types/database";

/** Restrained glass: translucent white over the mint band, a soft white edge, no heavy blur. */
export const GLASS = "rounded-[20px] border border-white/70 bg-white/80 shadow-card backdrop-blur-md";

type ProfileUser = { id: string; name: string | null; phone: string | null; email: string | null; avatarUrl: string | null };
const STATUS_TONE = { active: "success", pending: "warning", suspended: "danger" } as const;
const STATUS_KEY: Record<DeliveryPartner["status"], TKey> = { active: "status.active", pending: "status.pending", suspended: "status.suspended" };
const VEHICLES: { value: Enums<"vehicle_type">; label: TKey }[] = [
  { value: "bicycle", label: "vehicle.bicycle" }, { value: "bike", label: "vehicle.bike" }, { value: "scooter", label: "vehicle.scooter" }, { value: "auto", label: "vehicle.auto" }, { value: "van", label: "vehicle.van" },
];

/**
 * Rider profile, top to bottom: who you are and your status; alerts (sound + push, honest); vehicle and
 * documents shown read-only with one Edit that opens the form in a sheet; location (what GPS really does);
 * language; the installable app; notifications; support and sign out. Long explanations sit behind
 * "Learn more" toggles. Every save still goes through updateRiderProfileAction (own row, RLS).
 */
export function RiderProfile({ user, rider: initialRider, notifications, push }: { user: ProfileUser; rider: DeliveryPartner; notifications: Notification[]; push: PushConfig }) {
  const { t } = useT();
  const rider = useRiderStore((s) => s.rider) ?? initialRider;

  return (
    <div className="relative space-y-3">
      <span aria-hidden className="pointer-events-none absolute -inset-x-4 -top-4 -z-10 h-72 bg-[linear-gradient(180deg,#dcefe2_0%,#eef7f1_55%,transparent_100%)]" />
      <section className={cn(GLASS, "p-4")} aria-label={t("profile.account")}>
        <div className="flex items-center gap-3">
          <Avatar name={user.name} src={user.avatarUrl} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="truncate font-display text-[18px] font-extrabold text-ink">{user.name ?? t("rider.partner")}</h1><Badge tone={STATUS_TONE[rider.status]} size="xs">{t(STATUS_KEY[rider.status])}</Badge></div>
            <p className="mt-1 flex items-center gap-2 text-xs text-ink-2"><StarRating value={rider.rating_avg} count={rider.rating_count} /><span>· {formatNumber(rider.total_deliveries)} {t("profile.deliveries")}</span></p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
          {user.phone ? <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2"><Phone className="h-4 w-4 shrink-0 text-brand-700" aria-hidden /><dd className="truncate font-semibold text-ink">{user.phone}</dd></div> : null}
          {user.email ? <div className="flex min-w-0 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2"><Mail className="h-4 w-4 shrink-0 text-brand-700" aria-hidden /><dd className="truncate font-semibold text-ink">{user.email}</dd></div> : null}
        </dl>
      </section>

      <section id="alerts" className={cn(GLASS, "p-4")} aria-labelledby="rider-alerts-title">
        <h2 id="rider-alerts-title" className="flex items-center gap-2 font-display text-[16px] font-extrabold text-ink"><Bell className="h-4 w-4 text-brand-700" aria-hidden />{t("alerts.title")}</h2>
        <p className="mb-3 mt-0.5 text-xs text-ink-3">{t("alerts.body")}</p>
        <AlertSetup portal="rider" push={push} compact moreLabel={t("alerts.more")} />
      </section>

      <VehicleSection rider={rider} />

      <LocationSection />

      <section className={cn(GLASS, "flex items-center justify-between gap-3 p-4")}>
        <div className="min-w-0"><p className="flex items-center gap-2 font-display text-[16px] font-extrabold text-ink"><Languages className="h-4 w-4 text-brand-700" aria-hidden />{t("lang.title")}</p><p className="text-xs text-ink-3">{t("lang.body")}</p></div>
        <LangToggle />
      </section>

      <InstallCard />

      <NotificationsSection userId={user.id} initial={notifications} />

      <div className="grid grid-cols-2 gap-2 pb-2">
        <Link href="/account/support" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-card px-4 text-sm font-semibold text-ink shadow-card active:scale-[0.98]"><LifeBuoy className="h-5 w-5 text-brand-600" /> {t("profile.support")}</Link>
        <form action={staffSignOutAction} className="contents"><input type="hidden" name="portal" value="rider" /><SignOutButton /></form>
      </div>
    </div>
  );
}

/** Saved vehicle and document details, read-only; Edit opens the compact form in a sheet. */
function VehicleSection({ rider }: { rider: DeliveryPartner }) {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  const vehicle = VEHICLES.find((v) => v.value === rider.vehicle_type);
  const none = <span className="text-ink-4">{t("profile.notAdded")}</span>;
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: t("profile.vehicleType"), value: vehicle ? t(vehicle.label) : none },
    { label: t("profile.vehicleNumber"), value: rider.vehicle_number || none },
    { label: t("profile.licence"), value: rider.license_number || none },
    { label: t("profile.aadhaarShort"), value: rider.aadhaar_last4 ? <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-brand-600" aria-hidden />•••• {rider.aadhaar_last4}</span> : none },
    { label: t("profile.emergencyShort"), value: rider.emergency_contact || none },
  ];
  return (
    <section className={cn(GLASS, "p-4")} aria-labelledby="vehicle-head">
      <div className="flex items-center justify-between gap-3">
        <h2 id="vehicle-head" className="flex items-center gap-2 font-display text-[16px] font-extrabold text-ink"><Bike className="h-4 w-4 text-brand-700" aria-hidden />{t("profile.vehicleDocs")}</h2>
        <Button variant="outline" size="sm" className="h-9 rounded-full" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" aria-hidden /> {t("profile.edit")}</Button>
      </div>
      <dl className="mt-3 divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-2 text-[13px]">
            <dt className="text-ink-3">{r.label}</dt>
            <dd className="text-right font-semibold text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("profile.editVehicle")}>
        <VehicleForm rider={rider} onSaved={() => setOpen(false)} />
      </BottomSheet>
    </section>
  );
}

function VehicleForm({ rider, onSaved }: { rider: DeliveryPartner; onSaved: () => void }) {
  const { t } = useT();
  const [state, action, pending] = React.useActionState<RiderFormResult | null, FormData>(updateRiderProfileAction, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  React.useEffect(() => { if (state?.ok) { toast.success(state.message ?? t("common.saved")); onSaved(); } }, [state, t, onSaved]);
  return (
    <form action={action} className="space-y-3 pt-1">
      <Select name="vehicle_type" label={t("profile.vehicleType")} options={VEHICLES.map((v) => ({ value: v.value, label: t(v.label) }))} defaultValue={rider.vehicle_type} required error={fe.vehicle_type} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="vehicle_number" label={t("profile.vehicleNumber")} defaultValue={rider.vehicle_number ?? ""} placeholder="RJ 21 AB 1234" autoCapitalize="characters" error={fe.vehicle_number} />
        <Input name="license_number" label={t("profile.licence")} defaultValue={rider.license_number ?? ""} placeholder="RJ21 20230001234" autoCapitalize="characters" error={fe.license_number} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rider.aadhaar_last4 ? (
          <div className="space-y-1.5"><p className="text-sm font-medium text-ink-2">{t("profile.aadhaar")}</p><p className="flex h-11 items-center gap-2 rounded-sm border border-line bg-surface-2 px-3.5 text-sm text-ink-2"><ShieldCheck className="h-4 w-4 text-brand-600" /> •••• {rider.aadhaar_last4}</p><p className="text-[11px] text-ink-3">{t("profile.aadhaarVerified")}</p></div>
        ) : (
          <Input name="aadhaar_last4" label={t("profile.aadhaarLast4")} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="1234" hint={t("profile.aadhaarHint")} error={fe.aadhaar_last4} />
        )}
        <Input name="emergency_contact" label={t("profile.emergency")} defaultValue={rider.emergency_contact ?? ""} inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} placeholder="98290 12345" error={fe.emergency_contact} />
      </div>
      {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" size="lg" fullWidth className="h-12 rounded-xl" loading={pending}>{t("common.saveChanges")}</Button>
      <p className="text-[11px] text-ink-3">{t("profile.managedNote")}</p>
    </form>
  );
}

/** What GPS is doing right now, from the live fix, with the long explanation behind Learn more. */
function LocationSection() {
  const { t } = useT();
  const isOnline = useRiderStore((s) => s.isOnline);
  const active = useRiderStore((s) => s.activeDelivery);
  const status = useRiderStore((s) => s.rider?.status ?? "active");
  const on = status === "active" && (isOnline || active);
  return (
    <section className={cn(GLASS, "p-4")} aria-labelledby="loc-head">
      <div className="flex items-center justify-between gap-3">
        <h2 id="loc-head" className="flex items-center gap-2 font-display text-[16px] font-extrabold text-ink"><MapPin className="h-4 w-4 text-brand-700" aria-hidden />{t("profile.locationTitle")}</h2>
        {on ? <GpsIndicator className="text-[12px] font-semibold" /> : <span className="text-[12px] font-semibold text-ink-3">{t("status.offline")}</span>}
      </div>
      <p className="mt-1.5 text-xs text-ink-3">{on ? t("profile.locationOn") : t("profile.locationOff")}</p>
      <details className="group mt-2">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600">{t("profile.learnMore")}<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden /></summary>
        <p className="mt-1.5 text-xs text-ink-2">{t("profile.gpsBody")}</p>
        <p className="mt-1.5 text-xs text-ink-3">{t("profile.gpsTip")}</p>
      </details>
    </section>
  );
}

/** Submit button for the sign-out form: shows the pending state so a second tap can't fire the action twice. */
function SignOutButton() {
  const { t } = useT();
  const { pending } = useFormStatus();
  return <Button type="submit" variant="outline" size="lg" className="h-12 rounded-xl text-danger" loading={pending}><LogOut className="h-5 w-5" /> {pending ? t("profile.signingOut") : t("profile.signOut")}</Button>;
}

type NotificationGroup = { key: string; latest: Notification; count: number; unread: boolean };

/**
 * One row per order and type: the server keeps one `delivery_offer` row per order (0051) and refreshes it,
 * but older rows, and other types repeated for the same order (cancelled, reassigned), are folded here so
 * the list reads as events, not as a log of every retry. The count says how many there were.
 */
export function groupNotifications(items: Notification[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const n of items) {
    const orderId = (n.data as { order_id?: string } | null)?.order_id;
    const offers = Number((n.data as { offers?: number } | null)?.offers ?? 1);
    const key = orderId ? `${n.type}:${orderId}` : n.id;
    const g = groups.get(key);
    if (!g) groups.set(key, { key, latest: n, count: offers, unread: !n.is_read });
    else { g.count += offers; g.unread = g.unread || !n.is_read; if (n.created_at > g.latest.created_at) g.latest = n; }
  }
  return [...groups.values()].sort((a, b) => (a.latest.created_at < b.latest.created_at ? 1 : -1));
}

const PREVIEW = 5;

function NotificationsSection({ userId, initial }: { userId: string; initial: Notification[] }) {
  const { t } = useT();
  const { items, unread, setItems } = useNotifications(userId, initial, { toastNew: false });
  const groups = React.useMemo(() => groupNotifications(items), [items]);
  const [busy, setBusy] = React.useState(false);
  const [all, setAll] = React.useState(false);
  const shown = all ? groups.slice(0, 20) : groups.slice(0, PREVIEW);
  const markAll = async () => {
    if (busy) return;
    setBusy(true);
    const r = await markRiderNotificationsReadAction();
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setItems((cur) => cur.map((n) => ({ ...n, is_read: true })));
  };
  return (
    <section className={cn(GLASS, "overflow-hidden")} aria-labelledby="notif-head">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 id="notif-head" className="flex items-center gap-2 font-display text-[16px] font-extrabold text-ink"><Bell className="h-4 w-4 text-brand-700" aria-hidden /> {t("notif.title")}{unread ? <Badge tone="saffron" size="xs">{t("notif.newCount", { n: unread })}</Badge> : null}</h2>
        {unread ? <Button variant="ghost" size="xs" onClick={markAll} loading={busy}><CheckCheck className="h-4 w-4" /> {t("notif.markAllRead")}</Button> : null}
      </div>
      {items.length === 0 ? <EmptyState compact title={t("notif.emptyTitle")} description={t("notif.emptyBody")} /> : (
        <>
          <ul className="divide-y divide-line">
            {shown.map(({ key, latest: n, count, unread: isUnread }) => (
              <li key={key} className={cn("flex gap-3 px-4 py-3", isUnread && "bg-brand-50/60")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", isUnread ? "bg-brand-600" : "bg-transparent")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={cn("flex items-center gap-2 text-sm text-ink", isUnread && "font-semibold")}><span className="min-w-0 truncate">{n.title}</span>{count > 1 ? <Badge tone="neutral" size="xs" title={`${count}×`}>×{count}</Badge> : null}</p>
                  <p className="line-clamp-2 text-xs text-ink-2">{n.body}</p>
                  <p className="mt-0.5 text-[11px] text-ink-3">{count > 1 ? `${t("notif.latest")} ${timeAgo(n.created_at)}` : timeAgo(n.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
          {groups.length > PREVIEW ? (
            <button type="button" onClick={() => setAll((v) => !v)} className="flex min-h-11 w-full items-center justify-center gap-1 border-t border-line text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600">
              {all ? t("notif.showLess") : t("notif.showAll", { n: Math.min(groups.length, 20) })}<ChevronDown className={cn("h-4 w-4 transition-transform", all && "rotate-180")} aria-hidden />
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
