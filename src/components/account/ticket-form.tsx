"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { createTicketAction } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { formatDate, formatINR } from "@/lib/utils";
import { afterOverlayClose } from "@/hooks/use-back-to-close";

export const TICKET_CATEGORIES = [
  { value: "order", label: "Order issue" },
  { value: "payment", label: "Payment" },
  { value: "delivery", label: "Delivery" },
  { value: "refund", label: "Refund" },
  { value: "account", label: "Account" },
  { value: "general", label: "General" },
] as const;

export const TICKET_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(TICKET_CATEGORIES.map((c) => [c.value, c.label]));

export type TicketOrderOption = { id: string; order_number: string; total: number; created_at: string };

/** "New ticket" button + modal form. Preselects an order when `preselectOrder` is given (from `?order=`). */
export function TicketForm({ orders, preselectOrder, openInitially }: { orders: TicketOrderOption[]; preselectOrder?: string; openInitially?: boolean }) {
  const router = useRouter();
  const presel = preselectOrder && orders.some((o) => o.id === preselectOrder) ? preselectOrder : "";
  const [open, setOpen] = React.useState(Boolean(openInitially));
  const [subject, setSubject] = React.useState("");
  const [category, setCategory] = React.useState<string>(presel ? "order" : "general");
  const [orderId, setOrderId] = React.useState<string>(presel);
  const [message, setMessage] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (subject.trim().length < 4) errs.subject = "Add a short subject";
    if (message.trim().length < 10) errs.message = "Describe the issue in a few words";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (busy) return;
    setBusy(true);
    try {
      const r = await createTicketAction({ subject: subject.trim(), category, message: message.trim(), orderId: orderId || undefined });
      if (!r.ok) { toast.error(r.error); return; } // the typed subject and message stay in the form
      toast.success("Ticket created", "Our support team will reply here.");
      setOpen(false); afterOverlayClose(() => router.push(`/account/support/${r.data}`));
    } catch {
      toast.error("Could not create the ticket", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><MessageSquarePlus className="h-4 w-4" /> New ticket</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Raise a support ticket" description="Tell us what went wrong and we'll get back on this thread.">
        <form onSubmit={submit} className="space-y-4">
          <Input label="Subject" required value={subject} onChange={(e) => setSubject(e.target.value)} error={errors.subject} placeholder="e.g. Item missing from my order" maxLength={120} />
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={[...TICKET_CATEGORIES]} />
          <Select label="Related order (optional)" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Not about a specific order" options={orders.map((o) => ({ value: o.id, label: `${o.order_number} · ${formatINR(o.total)} · ${formatDate(o.created_at)}` }))} hint={orders.length ? undefined : "Your recent orders will appear here."} />
          <Textarea label="Message" required value={message} onChange={(e) => setMessage(e.target.value)} error={errors.message} placeholder="Share details like the item name, what you received, and what you'd like us to do." maxLength={2000} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" className="flex-1" loading={busy} disabled={busy}>Submit ticket</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
