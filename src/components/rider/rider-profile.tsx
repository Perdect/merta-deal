"use client";
import * as React from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Bell, CheckCheck, LifeBuoy, LogOut, Phone, Mail, ShieldCheck, Languages, Pencil, MapPin, ChevronRight, Bike, MessageSquareText, Smartphone } from "lucide-react";
import type { DeliveryPartner, Notification } from "@/types/app";
import { updateRiderProfileAction, markRiderNotificationsReadAction, setRiderSmsAlertsAction, type RiderFormResult } from "@/lib/actions/rider";
import { staffSignOutAction } from "@/lib/actions/auth";
import { useNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Input, Select, Switch } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/states";
import { Avatar, StarRating } from "@/components/ui/misc";
import { BottomSheet } from "@/components/ui/overlay";
import { AlertSetup, type PushConfig } from "@/components/alerts/alert-setup";
import { toast } from "@/components/ui/toast";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { useRiderStore } from "./rider-store";
import { InstallCard } from "./install-card";
import { LangToggle, GpsIndicator, riderNotificationText } from "./rider-shell";
import { useT, type TKey } from "@/lib/rider-i18n";
import { useAlertCopy } from "./alert-copy";
import type { Enums } from "@/types/database";

/** What the server knows about SMS alerts for this rider: whether it can send any, the owner's switch, the rider's own choice, and the number. */
export type RiderSmsState = { configured: boolean; enabled: boolean; optedIn: boolean; phone: string | null };

type ProfileUser = { id: string; name: string | null; phone: string | null; email: string | null; avatarUrl: string | null };
const STATUS_TONE = { active: "success", pending: "warning", suspended: "danger" } as const;
const STATUS_KEY: Record<DeliveryPartner["status"], TKey> = { active: "status.active", pending: "status.pending", suspended: "status.suspended" };
const VEHICLES: { value: Enums<"vehicle_type">; label: TKey }[] = [
  { value: "bicycle", label: "vehicle.bicycle" }, { value: "bike", label: "vehicle.bike" }, { value: "scooter", label: "vehicle.scooter" }, { value: "auto", label: "vehicle.auto" }, { value: "van", label: "vehicle.van" },
];

/**
 * Rider profile as an app settings screen: who you are; the alerts card (sound + notifications + SMS, honest
 * about what is and is not set up), which stays open because a phone that cannot ring earns nothing; then one
 * list of large rows. Vehicle and documents, location, the installable app and notifications each open in a
 * sheet that rises from the bottom; language is switched on its row; support and sign out end the list.
 * Every save still goes through updateRiderProfileAction (own row, RLS).
 */
const SMS_UNKNOWN: RiderSmsState = { configured: false, enabled: true, optedIn: false, phone: null };
const CARD = "overflow-hidden rounded-[20px] bg-card shadow-card ring-1 ring-line";
type Panel = "vehicle" | "location" | "install" | "notifications" | null;

export function RiderProfile({ user, rider: initialRider, notifications, push, sms = SMS_UNKNOWN }: { user: ProfileUser; rider: DeliveryPartner; notifications: Notification[]; push: PushConfig; /** Left out (fixture previews): shown as not set up, which is what an unconfigured server is. */ sms?: RiderSmsState }) {
  const { t } = useT();
  const alertCopy = useAlertCopy();
  const rider = useRiderStore((s) => s.rider) ?? initialRider;
  const [panel, setPanel] = React.useState<Panel>(null);
  const close = React.useCallback(() => setPanel(null), []);
  const { items, unread, setItems } = useNotifications(user.id, notifications, { toastNew: false });
  const vehicle = VEHICLES.find((v) => v.value === rider.vehicle_type);
  const isOnline = useRiderStore((s) => s.isOnline);
  const onDelivery = useRiderStore((s) => s.activeDelivery);
  const gpsOn = rider.status === "active" && (isOnline || onDelivery);

  return (
    <div className="space-y-4">
      <section className={cn(CARD, "p-4")} aria-label={t("profile.account")}>
        <div className="flex items-center gap-3.5">
          <Avatar name={user.name} src={user.avatarUrl} size={60} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="min-w-0 break-words font-display text-[20px] font-extrabold leading-tight text-ink">{user.name ?? t("rider.partner")}</h1><Badge tone={STATUS_TONE[rider.status]} size="sm">{t(STATUS_KEY[rider.status])}</Badge></div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[14px] text-ink-2"><StarRating value={rider.rating_avg} count={rider.rating_count} /><span>{formatNumber(rider.total_deliveries)} {t("profile.deliveries")}</span></p>
          </div>
        </div>
        {user.phone || user.email ? (
          <dl className="mt-3 space-y-1.5 text-[15px]">
            {user.phone ? <div className="flex items-center gap-2.5"><dt><Phone className="h-4.5 w-4.5 text-ink-3" aria-hidden /><span className="sr-only">{t("profile.phone")}</span></dt><dd className="font-semibold text-ink">{user.phone}</dd></div> : null}
            {user.email ? <div className="flex min-w-0 items-center gap-2.5"><dt><Mail className="h-4.5 w-4.5 text-ink-3" aria-hidden /><span className="sr-only">{t("profile.email")}</span></dt><dd className="min-w-0 truncate text-ink-2">{user.email}</dd></div> : null}
          </dl>
        ) : null}
      </section>

      <section id="alerts" className={cn(CARD, "scroll-mt-28 p-4")} aria-labelledby="rider-alerts-title">
        <h2 id="rider-alerts-title" className="flex items-center gap-2 font-display text-[18px] font-extrabold text-ink"><Bell className="h-5 w-5 text-brand-700" aria-hidden />{t("alerts.title")}</h2>
        <p className="mb-3 mt-0.5 text-[14px] text-ink-3">{t("alerts.body")}</p>
        <AlertSetup portal="rider" push={push} compact moreLabel={t("alerts.more")} copy={alertCopy} />
        <SmsAlerts sms={sms} />
      </section>

      <nav className={cn(CARD, "divide-y divide-line")} aria-label={t("profile.settings")}>
        <Row icon={<Bike className="h-5 w-5" />} title={t("profile.vehicleDocs")} value={[vehicle ? t(vehicle.label) : null, rider.vehicle_number].filter(Boolean).join(" · ") || t("profile.notAdded")} onClick={() => setPanel("vehicle")} />
        <Row icon={<MapPin className="h-5 w-5" />} title={t("profile.locationTitle")} value={gpsOn ? <GpsIndicator detail /> : t("profile.locationOffShort")} onClick={() => setPanel("location")} />
        <div className="flex min-h-[64px] items-center gap-3 px-4 py-2">
          <RowIcon><Languages className="h-5 w-5" /></RowIcon>
          <p className="min-w-0 flex-1 text-[16px] font-semibold text-ink">{t("lang.title")}</p>
          <LangToggle />
        </div>
        <Row icon={<Smartphone className="h-5 w-5" />} title={t("install.title")} onClick={() => setPanel("install")} />
        <Row icon={<Bell className="h-5 w-5" />} title={t("notif.title")} value={unread ? t("notif.newCount", { n: unread }) : undefined} hot={unread > 0} onClick={() => setPanel("notifications")} />
        <Row icon={<LifeBuoy className="h-5 w-5" />} title={t("profile.support")} href="/account/support" />
        <form action={staffSignOutAction}><input type="hidden" name="portal" value="rider" /><SignOutRow /></form>
      </nav>

      <BottomSheet open={panel === "vehicle"} onClose={close} title={t("profile.vehicleDocs")}>
        <VehiclePanel rider={rider} onSaved={close} />
      </BottomSheet>
      <BottomSheet open={panel === "location"} onClose={close} title={t("profile.locationTitle")}>
        <div className="space-y-3 pb-2 pt-1">
          <p className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3.5 py-3 text-[15px] font-semibold text-ink">{gpsOn ? <GpsIndicator detail /> : <><MapPin className="h-4.5 w-4.5 shrink-0 text-ink-3" aria-hidden />{t("profile.locationOff")}</>}</p>
          <p className="text-[15px] text-ink-2">{t("profile.locationOn")}</p>
          <p className="text-[15px] text-ink-2">{t("profile.gpsBody")}</p>
          <p className="text-[14px] text-ink-3">{t("profile.gpsTip")}</p>
        </div>
      </BottomSheet>
      <BottomSheet open={panel === "install"} onClose={close} title={t("install.title")}>
        <div className="pb-2 pt-1"><InstallCard bare /></div>
      </BottomSheet>
      <BottomSheet open={panel === "notifications"} onClose={close} title={t("notif.title")}>
        <NotificationsList items={items} unread={unread} setItems={setItems} />
      </BottomSheet>
    </div>
  );
}

function RowIcon({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", danger ? "bg-danger-50 text-danger" : "bg-brand-50 text-brand-700")} aria-hidden>{children}</span>;
}

/** One large touch row of the settings list: icon, title, a short current value, and a chevron. A link when it leads to a page. */
function Row({ icon, title, value, onClick, href, hot }: { icon: React.ReactNode; title: string; value?: React.ReactNode; onClick?: () => void; href?: string; hot?: boolean }) {
  const inner = (
    <>
      <RowIcon>{icon}</RowIcon>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold text-ink">{title}</span>
        {value ? <span className={cn("block truncate text-[14px]", hot ? "font-bold text-saffron-700" : "text-ink-3")}>{value}</span> : null}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-ink-4" aria-hidden />
    </>
  );
  const cls = "flex min-h-[64px] w-full select-none items-center gap-3 px-4 py-2 text-left active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600";
  return href ? <Link href={href} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

/**
 * The rider's own SMS switch, under the push and sound rows. It can only be turned on when the server
 * really can send a delivery SMS (an approved template is configured and the owner has not switched rider
 * SMS off) and the profile has a mobile number; otherwise it sits off and disabled with the reason beside
 * it. The choice is saved on the rider's profile and read by the database before every SMS.
 */
function SmsAlerts({ sms }: { sms: RiderSmsState }) {
  const { t } = useT();
  const [on, setOn] = React.useState(sms.optedIn);
  const [busy, setBusy] = React.useState(false);
  const [seen, setSeen] = React.useState(sms.optedIn);
  if (seen !== sms.optedIn) { setSeen(sms.optedIn); setOn(sms.optedIn); }
  const available = sms.configured && sms.enabled && Boolean(sms.phone);
  const why = !sms.configured ? t("sms.notConfigured") : !sms.enabled ? t("sms.switchedOff") : !sms.phone ? t("sms.noPhone") : t("sms.goesTo", { phone: sms.phone });
  const change = async (next: boolean) => {
    if (busy || !available) return;
    setBusy(true);
    try {
      const r = await setRiderSmsAlertsAction(next);
      if (!r.ok) { toast.error(t("sms.saveFailed"), r.error); return; }
      setOn(r.data.on);
      toast.success(r.data.on ? t("sms.savedOn") : t("sms.savedOff"));
    } catch { toast.error(t("sms.saveFailed"), t("common.noConnectionRetry")); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-4 rounded-2xl bg-surface-2 px-3.5 py-3">
      <p className="flex items-center gap-2 text-[15px] font-bold text-ink"><MessageSquareText className="h-4.5 w-4.5 text-brand-700" aria-hidden />{t("sms.title")}</p>
      <Switch className="mt-1" checked={available && on} onChange={change} disabled={busy || !available} label={t("sms.switch")} description={why} />
    </div>
  );
}

/** Saved vehicle and document details, read-only, with one Edit button that swaps in the form inside the same sheet. */
function VehiclePanel({ rider, onSaved }: { rider: DeliveryPartner; onSaved: () => void }) {
  const { t } = useT();
  const [editing, setEditing] = React.useState(false);
  const vehicle = VEHICLES.find((v) => v.value === rider.vehicle_type);
  const none = <span className="text-ink-4">{t("profile.notAdded")}</span>;
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: t("profile.vehicleType"), value: vehicle ? t(vehicle.label) : none },
    { label: t("profile.vehicleNumber"), value: rider.vehicle_number || none },
    { label: t("profile.licence"), value: rider.license_number || none },
    { label: t("profile.aadhaarShort"), value: rider.aadhaar_last4 ? <span className="inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden />•••• {rider.aadhaar_last4}</span> : none },
    { label: t("profile.emergencyShort"), value: rider.emergency_contact || none },
  ];
  if (editing) return <VehicleForm rider={rider} onSaved={onSaved} />;
  return (
    <div className="pb-2 pt-1">
      <dl className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[15px]">
            <dt className="text-ink-3">{r.label}</dt>
            <dd className="text-right font-semibold text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      <Button size="lg" variant="outline" fullWidth className="mt-3 h-13 rounded-2xl text-[16px]" onClick={() => setEditing(true)}><Pencil className="h-4.5 w-4.5" aria-hidden /> {t("profile.edit")}</Button>
    </div>
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
      <Button type="submit" size="lg" fullWidth className="h-14 rounded-2xl text-[17px]" loading={pending}>{t("common.saveChanges")}</Button>
      <p className="text-[11px] text-ink-3">{t("profile.managedNote")}</p>
    </form>
  );
}

/** Sign out as the last row of the list: shows the pending state so a second tap can't fire the action twice. */
function SignOutRow() {
  const { t } = useT();
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="flex min-h-[64px] w-full select-none items-center gap-3 px-4 py-2 text-left active:bg-danger-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-danger">
      <RowIcon danger><LogOut className="h-5 w-5" /></RowIcon>
      <span className="min-w-0 flex-1 text-[16px] font-semibold text-danger">{pending ? t("profile.signingOut") : t("profile.signOut")}</span>
    </button>
  );
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

/** The rider's notifications inside their sheet: one row per order and kind, newest first, with Mark all read. */
function NotificationsList({ items, unread, setItems }: { items: Notification[]; unread: number; setItems: React.Dispatch<React.SetStateAction<Notification[]>> }) {
  const { t } = useT();
  const groups = React.useMemo(() => groupNotifications(items), [items]);
  const [busy, setBusy] = React.useState(false);
  const markAll = async () => {
    if (busy) return;
    setBusy(true);
    const r = await markRiderNotificationsReadAction();
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setItems((cur) => cur.map((n) => ({ ...n, is_read: true })));
  };
  if (items.length === 0) return <EmptyState compact title={t("notif.emptyTitle")} description={t("notif.emptyBody")} />;
  return (
    <div className="pb-2">
      {unread ? <Button variant="outline" fullWidth className="mb-2 h-12 rounded-2xl text-[15px]" onClick={markAll} loading={busy}><CheckCheck className="h-5 w-5" aria-hidden /> {t("notif.markAllRead")}</Button> : null}
      <ul className="-mx-5 divide-y divide-line">
        {groups.slice(0, 20).map(({ key, latest: n, count, unread: isUnread }) => { const text = riderNotificationText(n, t); return (
          <li key={key} className={cn("flex gap-3 px-5 py-3", isUnread && "bg-brand-50/60")}>
            <span className={cn("mt-2 h-2.5 w-2.5 shrink-0 rounded-full", isUnread ? "bg-brand-600" : "bg-transparent")} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className={cn("flex items-center gap-2 text-[16px] text-ink", isUnread ? "font-bold" : "font-semibold")}><span className="min-w-0 break-words">{text.title}</span>{count > 1 ? <Badge tone="neutral" size="xs" title={`${count}×`}>×{count}</Badge> : null}</p>
              {text.body ? <p className="text-[14px] text-ink-2">{text.body}</p> : null}
              <p className="mt-0.5 text-[13px] text-ink-3">{count > 1 ? `${t("notif.latest")} ${timeAgo(n.created_at)}` : timeAgo(n.created_at)}</p>
            </div>
          </li>
        ); })}
      </ul>
    </div>
  );
}
