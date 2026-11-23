"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Check, CheckCheck, Send, Smartphone, MessageSquareText, RefreshCw } from "lucide-react";
import { Panel, EmptyBlock, IconAction } from "@/components/admin/kit";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { btn } from "@/components/admin/care/shared";
import { useNotifications, notificationHref } from "@/hooks/use-notifications";
import { broadcastAction, markAdminNotificationsReadAction } from "@/lib/actions/admin";
import { deliverRiderAlertsAction } from "@/lib/actions/alerts";
import { getDeliveryCodeStatusAction } from "@/lib/notifications/delivery-code-actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { Notification } from "@/types/app";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";
import { audienceOf, AUDIENCE_LABEL } from "@/lib/alerts/audience";

/* ------------------------------------------------------------------------------------------------
 * Inbox: live (Supabase Realtime) list of this admin's notifications, with mark-read.
 * ---------------------------------------------------------------------------------------------- */

export function AdminNotificationList({ userId, initial, limit }: { userId: string; initial: Notification[]; limit: number }) {
  const router = useRouter();
  const { items, unread, setItems } = useNotifications(userId, initial, { toastNew: true });
  const [filter, setFilter] = React.useState<"all" | "unread" | "admin">("admin");
  const [busy, setBusy] = React.useState<string | null>(null);
  const adminOnly = items.filter((n) => audienceOf(n.type, "admin") === "admin");
  const shown = filter === "unread" ? items.filter((n) => !n.is_read) : filter === "admin" ? adminOnly : items;
  const mixed = adminOnly.length !== items.length;

  const markRead = async (ids?: string[]) => {
    setBusy(ids ? ids[0] : "all");
    const r = await markAdminNotificationsReadAction(ids);
    setBusy(null);
    if (!r.ok) { toast.error("Couldn't mark as read", r.error); return; }
    setItems((cur) => cur.map((n) => (!ids || ids.includes(n.id) ? { ...n, is_read: true } : n)));
    if (!ids) toast.success(r.data ? `Marked ${r.data} ${r.data === 1 ? "notification" : "notifications"} as read` : "Everything was already read");
    router.refresh();
  };

  return (
    <Panel title="Inbox" description={mixed ? `Your latest ${limit} notifications · this account also receives customer or rider messages; they are labelled` : `Your latest ${limit} notifications · new ones arrive live`} flush
      actions={<button type="button" className={cn(btn.secondary, btn.small)} disabled={!unread || busy === "all"} onClick={() => markRead()}><CheckCheck className="h-3.5 w-3.5" aria-hidden />{busy === "all" ? "Marking…" : "Mark all read"}</button>}>
      <div role="tablist" aria-label="Show" className="flex gap-1 border-y border-line px-4 sm:px-5">
        {([["admin", "Admin", adminOnly.length], ["unread", "Unread", unread], ["all", "All", items.length]] as const).map(([v, label, n]) => (
          <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}
            className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-2 py-2 text-sm font-medium transition-colors duration-150", filter === v ? "border-brand-600 text-brand-800" : "border-transparent text-ink-3 hover:text-ink")}>
            {label}<span className={cn("rounded-full px-1.5 text-[11px] font-semibold leading-[18px] tabular", filter === v ? "bg-brand-100 text-brand-800" : "bg-surface-2 text-ink-3")}>{n}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        filter === "unread"
          ? <EmptyBlock icon={BellOff} title="No unread notifications" description="You're up to date. Switch to All to see earlier ones." />
          : filter === "admin" ? <EmptyBlock icon={Bell} title="No admin notifications yet" description="New orders, unattended-order reminders and dispatch problems show up here as they happen." />
          : <EmptyBlock icon={Bell} title="Nothing here yet" description="New orders, dispatch failures and support pings show up here as they happen." />
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3 sm:px-5", !n.is_read && "bg-brand-50/40")}>
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.is_read ? "bg-line-2" : "bg-brand-600")} aria-hidden />
              <div className="min-w-0 flex-1">
                <Link href={notificationHref(n, audienceOf(n.type, "admin"))} onClick={() => { if (!n.is_read) void markRead([n.id]); }} className="text-sm font-semibold text-ink hover:text-brand-700 hover:underline">{n.title}</Link>
                {audienceOf(n.type, "admin") !== "admin" ? <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-ink-3" title="Sent to this account in its other role">{AUDIENCE_LABEL[audienceOf(n.type, "admin")]}</span> : null}
                <p className="text-sm text-ink-2">{n.body}</p>
                <p className="mt-0.5 text-[11px] text-ink-4"><span className="sr-only">{n.is_read ? "Read" : "Unread"} · </span>{n.type.replace(/_/g, " ")} · <span title={formatDateTime(n.created_at)}>{timeAgo(n.created_at)}</span></p>
              </div>
              {!n.is_read ? <IconAction label="Mark as read" disabled={busy === n.id} onClick={() => markRead([n.id])}><Check className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction> : <span className="w-8 shrink-0 text-center text-[11px] text-ink-4">Read</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Broadcast: validated form, then an explicit confirm because it messages real people.
 * ---------------------------------------------------------------------------------------------- */

type Audience = "all" | "customers" | "riders" | "user";
const AUDIENCES: { value: Audience; label: string; who: string }[] = [
  { value: "customers", label: "All customers", who: "every customer" },
  { value: "riders", label: "All riders", who: "every rider" },
  { value: "all", label: "Everyone", who: "every customer and rider" },
  { value: "user", label: "One user (by email)", who: "one user" },
];
type Errs = { email?: string; title?: string; body?: string };

export function BroadcastForm() {
  const router = useRouter();
  const [audience, setAudience] = React.useState<Audience>("customers");
  const [email, setEmail] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [errors, setErrors] = React.useState<Errs>({});
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const validate = (): Errs => {
    const e: Errs = {};
    if (audience === "user" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Enter the user's email address.";
    if (title.trim().length < 3) e.title = "Write a title of at least 3 characters.";
    if (body.trim().length < 5) e.body = "Write a message of at least 5 characters.";
    return e;
  };
  const review = () => { const e = validate(); setErrors(e); if (!Object.keys(e).length) setConfirm(true); };
  const send = async () => {
    setBusy(true);
    const r = await broadcastAction({ audience, title: title.trim(), body: body.trim(), email: audience === "user" ? email.trim() : "" });
    setBusy(false); setConfirm(false);
    if (r.ok) {
      toast.success(`Sent to ${r.data.recipients} ${r.data.recipients === 1 ? "person" : "people"}`, r.data.recipients ? undefined : "Nobody matched this audience.");
      setTitle(""); setBody(""); setEmail(""); setErrors({}); router.refresh();
    } else toast.error("Broadcast not sent", r.error);
  };
  const aud = AUDIENCES.find((a) => a.value === audience)!;

  return (
    <Panel title="Send a broadcast" description="In-app now, plus web push where the person subscribed and push keys are configured. Every broadcast is audited.">
      <form noValidate onSubmit={(e) => { e.preventDefault(); review(); }} className="space-y-3">
        <Select label="Audience" options={AUDIENCES.map((a) => ({ value: a.value, label: a.label }))} value={audience} onChange={(e) => { setAudience(e.target.value as Audience); setErrors((x) => ({ ...x, email: undefined })); }} />
        {audience === "user" ? <Input label="User email" required type="email" value={email} error={errors.email} onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }} placeholder="name@example.com" autoComplete="off" /> : null}
        <Input label="Title" required value={title} error={errors.title} onChange={(e) => { setTitle(e.target.value); setErrors((x) => ({ ...x, title: undefined })); }} maxLength={120} hint={`${title.length}/120`} />
        <Textarea label="Message" value={body} error={errors.body} onChange={(e) => { setBody(e.target.value); setErrors((x) => ({ ...x, body: undefined })); }} maxLength={1000} hint={`${body.length}/1000`} />
        <button type="submit" className={btn.primary}><Send className="h-4 w-4" aria-hidden />Review and send</button>
      </form>
      <ConfirmDialog open={confirm} onClose={() => !busy && setConfirm(false)} loading={busy} confirmLabel="Send now"
        title={audience === "user" ? `Send to ${email.trim()}?` : `Send to ${aud.label.toLowerCase()}?`}
        onConfirm={send}
        description={<span className="block space-y-2"><span className="block">This notifies {audience === "user" ? email.trim() : aud.who} immediately and can&apos;t be recalled.</span><span className="block rounded-lg border border-line bg-surface p-3"><strong className="block text-ink">{title.trim()}</strong><span className="mt-1 block whitespace-pre-wrap text-ink-2">{body.trim()}</span></span></span>} />
    </Panel>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Rider alerts (0058): what really happened to each delivery request and "no longer yours" notice.
 * ---------------------------------------------------------------------------------------------- */

export type RiderAlertChannelRow = {
  channel: "push" | "sms"; configured: boolean;
  /** Names of the server settings still missing when not configured. */
  needs: string[];
  last_status: string | null; last_at: string | null; last_error: string | null;
  sent_24h: number; failed_24h: number; skipped_24h: number; no_device_24h: number;
};
export type RiderAlertEvent = {
  notification_id: string; event_key: string; kind: "offer" | "released"; at: string; order_id: string | null; order_number: string | null; rider: string | null;
  /** False for an earlier offer of the same order to the same rider (the row has since been re-offered). */
  current: boolean;
  deliveries: { channel: string; status: string; attempts: number; error: string | null; provider_id: string | null; updated_at: string }[];
};

const RIDER_CHANNEL: Record<RiderAlertChannelRow["channel"], { label: string; icon: React.ReactNode; how: string }> = {
  push: { label: "Push to the rider app", icon: <Smartphone className="h-4 w-4" aria-hidden />, how: "Each rider enables notifications once per phone on their Profile tab. On iPhone the rider app must be on the Home Screen first." },
  sms: { label: "SMS", icon: <MessageSquareText className="h-4 w-4" aria-hidden />, how: "Sent for delivery requests only, to riders who switched SMS on in their Profile tab, on the approved delivery-alert template. Each SMS is charged by the panel." },
};
const RIDER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  sent: { label: "Accepted by provider", tone: "success" },
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  queued: { label: "Sending", tone: "info" },
  no_recipient: { label: "No device / number", tone: "warning" },
  unavailable: { label: "Not configured", tone: "neutral" },
  skipped: { label: "Not sent", tone: "neutral" },
};

/**
 * Status of rider alerts for admins. Nothing here is inferred: "Accepted by provider" means the push
 * service or the SMS panel took the message, "Not sent" carries the database's reason (the request had
 * expired, another rider took it, the rider has SMS off, …) and "Failed" carries the provider's answer
 * and how many times it was tried. "Send waiting alerts now" runs the same sweep the scheduler runs.
 */
export function RiderAlertStatus({ available, channels, recent }: { available: boolean; channels: RiderAlertChannelRow[]; recent: RiderAlertEvent[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await deliverRiderAlertsAction();
      if (!r.ok) { toast.error("Could not run rider alerts", r.error); return; }
      const { push, sms } = r.data.channels;
      const held = Object.entries(r.data.refusals).map(([why, n]) => `${n} ${why.replace(/_/g, " ")}`).join(", ");
      toast.info(`Checked ${r.data.notifications} waiting alert${r.data.notifications === 1 ? "" : "s"}`,
        `Push: ${push.sent} sent, ${push.failed} failed, ${push.no_recipient} with no device. SMS: ${sms.sent} sent, ${sms.failed} failed.${held ? ` Not sent: ${held}.` : ""}`);
      router.refresh();
    } finally { setBusy(false); }
  };

  if (!available) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-warning-50 px-3 py-2 text-sm text-ink">Rider alert tracking is not switched on in the database yet (migration 0058). Until it is, delivery requests still reach riders in the app and through the older push sweep, without the per-rider record shown here.</p>
        <DeliveryCodeStatus />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {channels.map((c) => {
          const m = RIDER_CHANNEL[c.channel]; const st = c.last_status ? RIDER_STATUS[c.last_status] ?? { label: c.last_status, tone: "neutral" as BadgeTone } : null;
          return (
            <li key={c.channel} className="flex flex-col gap-1.5 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">{m.icon}{m.label}
                  {c.configured ? <Badge tone="success" size="xs">Configured</Badge> : <Badge tone="neutral" size="xs">Not configured</Badge>}
                </p>
                <p className="mt-0.5 text-xs text-ink-3">{c.configured ? m.how : `Nothing is sent on this channel. Needs ${c.needs.join(", ")} on the server.`}</p>
                {c.last_error && c.last_status === "failed" ? <p className="mt-0.5 text-xs text-danger">Last failure: {c.last_error}</p> : null}
              </div>
              <div className="shrink-0 text-left sm:text-right">
                {st ? <Badge tone={st.tone} size="xs">{st.label}</Badge> : <Badge tone="neutral" size="xs">No alerts yet</Badge>}
                <p className="mt-1 text-[11px] text-ink-3">{c.last_at ? <span title={formatDateTime(c.last_at)}>{timeAgo(c.last_at)}</span> : "—"} · 24 h: {c.sent_24h} sent, {c.failed_24h} failed, {c.skipped_24h} not sent{c.no_device_24h ? `, ${c.no_device_24h} no device` : ""}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" className={cn(btn.secondary, btn.small)} disabled={busy} onClick={run}><RefreshCw className="h-3.5 w-3.5" aria-hidden />{busy ? "Sending…" : "Send waiting alerts now"}</button>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Recent rider alerts</p>
        {recent.length === 0 ? <p className="text-sm text-ink-3">No delivery request has been recorded yet.</p> : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {recent.map((e) => (
              <li key={`${e.notification_id}:${e.event_key}`} className="px-3 py-2.5">
                <p className="flex flex-wrap items-center justify-between gap-x-2 text-sm">
                  <span className="min-w-0">
                    {e.order_id ? <Link href={`/admin/orders/${e.order_id}`} className="font-semibold text-brand-700 hover:underline">{e.order_number ?? "Order"}</Link> : <span className="font-semibold text-ink">{e.order_number ?? "Order"}</span>}
                    <span className="text-ink-2"> · {e.kind === "offer" ? "Request" : "No longer theirs"} · {e.rider ?? "Rider"}</span>
                    {!e.current ? <span className="text-ink-3"> · earlier offer</span> : null}
                  </span>
                  <span className="text-xs text-ink-3" title={formatDateTime(e.at)}>{timeAgo(e.at)}</span>
                </p>
                {e.deliveries.length === 0 ? <p className="mt-1 text-xs text-ink-3">In the rider&apos;s app only so far: push and SMS have not been attempted yet.</p> : (
                  <ul className="mt-1 space-y-1">
                    {e.deliveries.map((d) => {
                      const st = RIDER_STATUS[d.status] ?? { label: d.status, tone: "neutral" as BadgeTone };
                      const answer = d.status === "sent" || d.status === "delivered" ? d.provider_id : d.error;
                      return (
                        <li key={d.channel} className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-2">
                          <Badge tone={st.tone} size="xs">{d.channel === "sms" ? "SMS" : "Push"}: {st.label}</Badge>
                          {d.attempts > 0 ? <span className="text-ink-3">{d.attempts} attempt{d.attempts === 1 ? "" : "s"}</span> : null}
                          {answer ? <span className={cn("min-w-0 break-words", d.status === "failed" && "text-danger")}>{answer}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <DeliveryCodeStatus />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Delivery codes (0059): the SMS a customer gets when the rider reaches them, request by request.
 * ---------------------------------------------------------------------------------------------- */

export type DeliveryCodeEvent = {
  notification_id: string; at: string; kind: "arrival" | "resend"; order_id: string | null; order_number: string | null;
  /** Null: the request was written but the server has not attempted it. */
  status: string | null; attempts: number; error: string | null; provider_id: string | null; updated_at: string | null;
};
export type DeliveryCodeStatusData = {
  /** False until migration 0059 is applied. */
  available: boolean; configured: boolean;
  /** Names of the server settings still missing when not configured. */
  needs: string[];
  summary: { last_status: string | null; last_at: string | null; last_error: string | null; sent_24h: number; failed_24h: number; not_sent_24h: number };
  recent: DeliveryCodeEvent[];
};

/**
 * Delivery code SMS for admins: whether the server can send them, and what the SMS panel really answered
 * for each request (the one when the rider reached the customer, and each resend). "Accepted by provider"
 * appears only when the panel took the message. There is no code here to show: only its hash is ever stored.
 */
function DeliveryCodeStatus() {
  const [data, setData] = React.useState<DeliveryCodeStatusData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    setBusy(true);
    try {
      const r = await getDeliveryCodeStatusAction();
      if (r.ok) { setData(r.data); setError(null); } else setError(r.error);
    } catch { setError("Could not load the delivery code status. Check your connection and refresh."); }
    finally { setBusy(false); }
  }, []);
  React.useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);

  const last = data?.summary.last_status ? RIDER_STATUS[data.summary.last_status] ?? { label: data.summary.last_status, tone: "neutral" as BadgeTone } : null;
  return (
    <div id="delivery-codes" className="border-t border-line pt-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink"><MessageSquareText className="h-4 w-4" aria-hidden />Delivery codes to customers (SMS)
          {data ? (data.configured ? <Badge tone="success" size="xs">Configured</Badge> : <Badge tone="neutral" size="xs">Not configured</Badge>) : null}
        </p>
        <button type="button" className={cn(btn.secondary, btn.small)} disabled={busy} onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" aria-hidden />{busy ? "Loading…" : "Refresh"}</button>
      </div>
      {error ? <p className="mt-1.5 text-sm text-danger">{error}</p> : null}
      {!data ? (error ? null : <p className="mt-1.5 text-sm text-ink-3">Loading…</p>) : !data.available ? (
        <p className="mt-1.5 rounded-md bg-warning-50 px-3 py-2 text-sm text-ink">Delivery codes at the door are not switched on in the database yet (migration 0059). Until it is, the customer sees the delivery code in their order as before, and nothing is sent by SMS.</p>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-ink-3">{data.configured
            ? "When a rider marks that they have reached the customer, a one-time code goes to the customer by SMS on the approved delivery-code template. The customer can also open a code on their own order screen. Each SMS is charged by the panel."
            : `No delivery code SMS is sent: the customer reads the code on their own order screen, and the rider app tells the rider so. Needs ${data.needs.join(", ")} on the server.`}</p>
          <p className="mt-1 text-[11px] text-ink-3">{last ? <Badge tone={last.tone} size="xs">{last.label}</Badge> : <Badge tone="neutral" size="xs">No requests yet</Badge>}{" "}
            {data.summary.last_at ? <span title={formatDateTime(data.summary.last_at)}>{timeAgo(data.summary.last_at)}</span> : "—"} · 24 h: {data.summary.sent_24h} sent, {data.summary.failed_24h} failed, {data.summary.not_sent_24h} not sent</p>
          {data.summary.last_error && data.summary.last_status === "failed" ? <p className="mt-0.5 text-xs text-danger">Last failure: {data.summary.last_error}</p> : null}
          <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Recent delivery code requests</p>
          {data.recent.length === 0 ? <p className="text-sm text-ink-3">No rider has reached a customer since this was switched on.</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {data.recent.map((e) => {
                const st = e.status ? RIDER_STATUS[e.status] ?? { label: e.status, tone: "neutral" as BadgeTone } : { label: "Not attempted yet", tone: "neutral" as BadgeTone };
                const answer = e.status === "sent" || e.status === "delivered" ? e.provider_id : e.error;
                return (
                  <li key={e.notification_id} className="px-3 py-2.5">
                    <p className="flex flex-wrap items-center justify-between gap-x-2 text-sm">
                      <span className="min-w-0">
                        {e.order_id ? <Link href={`/admin/orders/${e.order_id}`} className="font-semibold text-brand-700 hover:underline">{e.order_number ?? "Order"}</Link> : <span className="font-semibold text-ink">{e.order_number ?? "Order"}</span>}
                        <span className="text-ink-2"> · {e.kind === "resend" ? "Resend asked by the rider" : "Rider reached the customer"}</span>
                      </span>
                      <span className="text-xs text-ink-3" title={formatDateTime(e.at)}>{timeAgo(e.at)}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-ink-2">
                      <Badge tone={st.tone} size="xs">SMS: {st.label}</Badge>
                      {e.attempts > 0 ? <span className="text-ink-3">{e.attempts} attempt{e.attempts === 1 ? "" : "s"}</span> : null}
                      {answer ? <span className={cn("min-w-0 break-words", e.status === "failed" && "text-danger")}>{answer}</span> : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
