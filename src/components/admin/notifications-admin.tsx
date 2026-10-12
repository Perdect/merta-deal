"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Check, CheckCheck, Send } from "lucide-react";
import { Panel, EmptyBlock, IconAction } from "@/components/admin/kit";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { btn } from "@/components/admin/care/shared";
import { useNotifications, notificationHref } from "@/hooks/use-notifications";
import { broadcastAction, markAdminNotificationsReadAction } from "@/lib/actions/admin";
import type { Notification } from "@/types/app";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

/* ------------------------------------------------------------------------------------------------
 * Inbox: live (Supabase Realtime) list of this admin's notifications, with mark-read.
 * ---------------------------------------------------------------------------------------------- */

export function AdminNotificationList({ userId, initial, limit }: { userId: string; initial: Notification[]; limit: number }) {
  const router = useRouter();
  const { items, unread, setItems } = useNotifications(userId, initial, { toastNew: true });
  const [filter, setFilter] = React.useState<"all" | "unread">("all");
  const [busy, setBusy] = React.useState<string | null>(null);
  const shown = filter === "unread" ? items.filter((n) => !n.is_read) : items;

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
    <Panel title="Inbox" description={`Your latest ${limit} notifications · new ones arrive live`} flush
      actions={<button type="button" className={cn(btn.secondary, btn.small)} disabled={!unread || busy === "all"} onClick={() => markRead()}><CheckCheck className="h-3.5 w-3.5" aria-hidden />{busy === "all" ? "Marking…" : "Mark all read"}</button>}>
      <div role="tablist" aria-label="Show" className="flex gap-1 border-y border-line px-4 sm:px-5">
        {([["all", "All", items.length], ["unread", "Unread", unread]] as const).map(([v, label, n]) => (
          <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}
            className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-2 py-2 text-sm font-medium transition-colors duration-150", filter === v ? "border-brand-600 text-brand-800" : "border-transparent text-ink-3 hover:text-ink")}>
            {label}<span className={cn("rounded-full px-1.5 text-[11px] font-semibold leading-[18px] tabular", filter === v ? "bg-brand-100 text-brand-800" : "bg-surface-2 text-ink-3")}>{n}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        filter === "unread"
          ? <EmptyBlock icon={BellOff} title="No unread notifications" description="You're up to date. Switch to All to see earlier ones." />
          : <EmptyBlock icon={Bell} title="Nothing here yet" description="Store applications, dispatch failures and support pings show up here as they happen." />
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3 sm:px-5", !n.is_read && "bg-brand-50/40")}>
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.is_read ? "bg-line-2" : "bg-brand-600")} aria-hidden />
              <div className="min-w-0 flex-1">
                <Link href={notificationHref(n, "admin")} onClick={() => { if (!n.is_read) void markRead([n.id]); }} className="text-sm font-semibold text-ink hover:text-brand-700 hover:underline">{n.title}</Link>
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

type Audience = "all" | "customers" | "stores" | "riders" | "user";
const AUDIENCES: { value: Audience; label: string; who: string }[] = [
  { value: "customers", label: "All customers", who: "every customer" },
  { value: "stores", label: "All store owners and staff", who: "every store owner and staff member" },
  { value: "riders", label: "All riders", who: "every rider" },
  { value: "all", label: "Everyone", who: "every customer, store and rider" },
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
