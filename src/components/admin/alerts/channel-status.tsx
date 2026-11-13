"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Smartphone, MessageCircle, Mail, Send, RefreshCw, CheckCircle2, XCircle, MinusCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { deliverOrderAlertsAction, sendTestAlertAction } from "@/lib/actions/alerts";
import { formatDateTime, timeAgo } from "@/lib/utils";

export type ChannelRow = {
  channel: "push" | "whatsapp" | "email";
  configured: boolean;
  /** What is missing when not configured (env var names), for the admin to pass on. */
  needs: string[];
  last_status: string | null; last_at: string | null; last_error: string | null; sent_24h: number; failed_24h: number;
};
export type RecentAlert = { order_id: string; order_number: string; created_at: string; admins: number; deliveries: { channel: string; status: string; attempts: number; error: string | null; updated_at: string; admin: string | null }[] };

const META: Record<ChannelRow["channel"], { label: string; icon: React.ReactNode; how: string }> = {
  push: { label: "Mobile push", icon: <Smartphone className="h-4 w-4" aria-hidden />, how: "Each admin enables push once per device under Order alerts on this device." },
  whatsapp: { label: "WhatsApp", icon: <MessageCircle className="h-4 w-4" aria-hidden />, how: "Sent to the mobile number on each admin's profile through the WhatsApp Cloud API; an approved template is needed outside a 24-hour chat window." },
  email: { label: "Email", icon: <Mail className="h-4 w-4" aria-hidden />, how: "Sent to the email on each admin's profile through Resend." },
};
const STATUS: Record<string, { label: string; tone: BadgeTone; icon: React.ReactNode }> = {
  sent: { label: "Accepted by provider", tone: "success", icon: <CheckCircle2 className="h-3 w-3" aria-hidden /> },
  delivered: { label: "Delivered", tone: "success", icon: <CheckCircle2 className="h-3 w-3" aria-hidden /> },
  failed: { label: "Failed", tone: "danger", icon: <XCircle className="h-3 w-3" aria-hidden /> },
  queued: { label: "Queued", tone: "info", icon: <Clock className="h-3 w-3" aria-hidden /> },
  no_recipient: { label: "No device / number", tone: "warning", icon: <MinusCircle className="h-3 w-3" aria-hidden /> },
  unavailable: { label: "Not configured", tone: "neutral", icon: <MinusCircle className="h-3 w-3" aria-hidden /> },
};

/**
 * Honest state of each new-order alert channel: configured or not (and what is missing), the latest real
 * outcome and the last day's counts, plus the recent orders and how every admin's alert went. "Deliver now"
 * runs the same sweep the scheduler runs; "Send test alert" sends to the signed-in admin only.
 */
export function ChannelStatus({ channels, recent, cronHint }: { channels: ChannelRow[]; recent: RecentAlert[]; cronHint: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"deliver" | "test" | null>(null);
  const run = async (kind: "deliver" | "test") => {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "deliver") {
        const r = await deliverOrderAlertsAction();
        if (!r.ok) { toast.error("Could not run delivery", r.error); return; }
        const c = r.data.channels;
        toast.info(`Checked ${r.data.notifications} alert${r.data.notifications === 1 ? "" : "s"}`, `Push ${c.push.sent} sent · WhatsApp ${c.whatsapp.sent} sent · Email ${c.email.sent} sent${c.push.failed + c.whatsapp.failed + c.email.failed ? ` · ${c.push.failed + c.whatsapp.failed + c.email.failed} failed` : ""}`);
      } else {
        const r = await sendTestAlertAction();
        if (!r.ok) { toast.error("Could not send the test", r.error); return; }
        const sent = r.data.channels.filter((c) => c.sent).map((c) => META[c.channel as ChannelRow["channel"]]?.label ?? c.channel);
        if (sent.length) toast.success(`Test sent by ${sent.join(", ")}`, "Check your phone and inbox."); else toast.warning("No channel could send", r.data.channels.map((c) => `${c.channel}: ${c.detail}`).join(" · "));
      }
      router.refresh();
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {channels.map((c) => {
          const m = META[c.channel]; const st = c.last_status ? STATUS[c.last_status] : null;
          return (
            <li key={c.channel} className="flex flex-col gap-1.5 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">{m.icon}{m.label}
                  {c.configured ? <Badge tone="success" size="xs">Configured</Badge> : <Badge tone="neutral" size="xs">Not configured</Badge>}
                </p>
                <p className="mt-0.5 text-xs text-ink-3">{c.configured ? m.how : `Needs ${c.needs.join(", ")} on the server.`}</p>
                {c.last_error && c.last_status !== "unavailable" ? <p className="mt-0.5 truncate text-xs text-danger" title={c.last_error}>Last error: {c.last_error}</p> : null}
              </div>
              <div className="shrink-0 text-left sm:text-right">
                {st ? <Badge tone={st.tone} size="xs"><span className="mr-1">{st.icon}</span>{st.label}</Badge> : <Badge tone="neutral" size="xs">No alerts yet</Badge>}
                <p className="mt-1 text-[11px] text-ink-3">{c.last_at ? <span title={formatDateTime(c.last_at)}>{timeAgo(c.last_at)}</span> : "—"}{c.configured ? ` · 24 h: ${c.sent_24h} sent, ${c.failed_24h} failed` : ""}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => run("deliver")} loading={busy === "deliver"} disabled={busy !== null}><RefreshCw className="h-4 w-4" /> Deliver pending now</Button>
        <Button size="sm" onClick={() => run("test")} loading={busy === "test"} disabled={busy !== null}><Send className="h-4 w-4" /> Send me a test alert</Button>
      </div>
      {cronHint ? <p className="rounded-md bg-surface px-3 py-2 text-xs text-ink-2">{cronHint}</p> : null}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Recent orders</p>
        {recent.length === 0 ? <p className="text-sm text-ink-3">No new-order alerts recorded yet.</p> : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {recent.map((o) => (
              <li key={o.order_id} className="px-3 py-2.5">
                <p className="flex items-center justify-between gap-2 text-sm"><a href={`/admin/orders/${o.order_id}`} className="font-semibold text-brand-700 hover:underline">{o.order_number}</a><span className="text-xs text-ink-3" title={formatDateTime(o.created_at)}>{timeAgo(o.created_at)} · {o.admins} admin{o.admins === 1 ? "" : "s"}</span></p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {o.deliveries.length === 0 ? <span className="text-xs text-ink-3">Only the in-app alert so far (delivery not run yet).</span> : o.deliveries.map((d, i) => { const st = STATUS[d.status] ?? STATUS.queued; return <Badge key={i} tone={st.tone} size="xs" title={[d.admin, d.error, `${d.attempts} attempt(s)`].filter(Boolean).join(" · ")}>{META[d.channel as ChannelRow["channel"]]?.label ?? d.channel}: {st.label}</Badge>; })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
