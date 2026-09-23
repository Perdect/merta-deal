"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Send, CheckCheck, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { useNotifications, notificationHref } from "@/hooks/use-notifications";
import { broadcastAction, markAdminNotificationsReadAction } from "@/lib/actions/admin";
import type { Notification } from "@/types/app";
import { cn, timeAgo } from "@/lib/utils";

export function AdminNotificationList({ userId, initial }: { userId: string; initial: Notification[] }) {
  const router = useRouter();
  const { items, unread } = useNotifications(userId, initial, { toastNew: true });
  const [busy, setBusy] = React.useState(false);
  const markAll = async () => { setBusy(true); const r = await markAdminNotificationsReadAction(); setBusy(false); if (r.ok) { toast.success(`Marked ${r.data} as read`); router.refresh(); } else toast.error(r.error); };
  const markOne = async (id: string) => { await markAdminNotificationsReadAction([id]); router.refresh(); };
  return (
    <div className="rounded-lg border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3"><p className="text-sm font-semibold text-ink">Your notifications {unread ? <span className="ml-1 rounded-full bg-danger px-1.5 py-0.5 text-[10px] text-white">{unread}</span> : null}</p><Button size="xs" variant="ghost" disabled={!unread} loading={busy} onClick={markAll}><CheckCheck className="h-3.5 w-3.5" /> Mark all read</Button></div>
      {items.length === 0 ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-ink-3"><Bell className="h-4 w-4" /> Nothing yet. Store approvals, dispatch failures and support pings show up here.</p> : (
        <ul className="divide-y divide-line">
          {items.map((n) => (
            <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.is_read && "bg-brand-50/40")}>
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-brand-600")} />
              <div className="min-w-0 flex-1">
                <Link href={notificationHref(n, "admin")} onClick={() => !n.is_read && markOne(n.id)} className="text-sm font-semibold text-ink hover:underline">{n.title}</Link>
                <p className="text-sm text-ink-2">{n.body}</p>
                <p className="mt-0.5 text-[11px] text-ink-4">{n.type} · {timeAgo(n.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const AUDIENCES = [{ value: "customers", label: "All customers" }, { value: "stores", label: "All store owners & staff" }, { value: "riders", label: "All riders" }, { value: "all", label: "Everyone" }, { value: "user", label: "A single user (by email)" }];

export function BroadcastForm() {
  const router = useRouter();
  const [audience, setAudience] = React.useState<"all" | "customers" | "stores" | "riders" | "user">("customers");
  const [email, setEmail] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const send = async () => {
    setBusy(true); const r = await broadcastAction({ audience, title, body, email }); setBusy(false); setConfirm(false);
    if (r.ok) { toast.success(`Sent to ${r.data.recipients} ${r.data.recipients === 1 ? "user" : "users"}`); setTitle(""); setBody(""); setEmail(""); router.refresh(); } else toast.error(r.error);
  };
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><Megaphone className="h-4 w-4 text-saffron-600" /> Broadcast</p>
      <div className="space-y-3">
        <Select label="Audience" options={AUDIENCES} value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)} />
        {audience === "user" ? <Input label="User email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" required /> : null}
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="Diwali offer: free delivery all week" />
        <Textarea label="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} required placeholder="Order above ₹299 from any Merta store and delivery is on us till Sunday." />
        <p className="text-xs text-ink-3">Delivered in-app immediately and via web push where the user has subscribed and VAPID keys are configured. Every broadcast is audited.</p>
        <Button disabled={!title.trim() || !body.trim() || (audience === "user" && !email)} onClick={() => setConfirm(true)}><Send className="h-4 w-4" /> Send</Button>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Send to ${AUDIENCES.find((a) => a.value === audience)?.label.toLowerCase()}?`} description={<span><strong>{title}</strong><br />{body}</span>} confirmLabel="Send now" loading={busy} onConfirm={send} />
    </div>
  );
}
