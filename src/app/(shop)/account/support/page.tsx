import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Phone, Mail, LifeBuoy, ChevronRight } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyTickets } from "@/lib/data/account";
import { getMyOrders } from "@/lib/data/orders";
import { getPublicSettings } from "@/lib/data/catalog";
import { isRazorpayConfigured } from "@/lib/env";
import { site } from "@/config/site";
import { FaqAccordion, type FaqItem } from "@/components/account/faq";
import { TicketForm, TICKET_CATEGORY_LABEL, type TicketOrderOption } from "@/components/account/ticket-form";
import { AccountSection } from "@/components/account/account-section";
import { SectionHeader } from "@/components/ui/card";
import { WhatsAppIcon } from "@/components/shared/whatsapp-icon";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatINR, formatDateTime } from "@/lib/utils";
import type { Enums } from "@/types/database";

export const metadata: Metadata = { title: "Help & support", robots: { index: false } };
export const dynamic = "force-dynamic";

const TICKET_STATUS: Record<Enums<"ticket_status">, { label: string; tone: BadgeTone }> = {
  open: { label: "Open", tone: "info" },
  in_progress: { label: "In progress", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

function str(v: unknown, fallback: string) { return typeof v === "string" && v.trim() ? v : fallback; }
function num(v: unknown, fallback: number) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ order?: string; new?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/support");
  const [ticketsAll, settings, { orders }] = await Promise.all([getMyTickets(), getPublicSettings(), getMyOrders({ limit: 20 })]);
  const tickets = ticketsAll.slice(0, 50);
  const orderOptions: TicketOrderOption[] = orders.map((o) => ({ id: o.id, order_number: o.order_number, total: Number(o.total), created_at: o.created_at }));

  const phone = str(settings.support_phone, site.supportPhone);
  const whatsapp = str(settings.support_whatsapp, "").replace(/\D/g, "");
  const email = str(settings.support_email, site.supportEmail);
  const etaMin = num(settings.delivery_eta_min_minutes, 30), etaMax = num(settings.delivery_eta_max_minutes, 60);
  const xMin = num(settings.express_eta_min_minutes, 20), xMax = num(settings.express_eta_max_minutes, 35);
  const freeAbove = num(settings.free_delivery_threshold, 0), minOrder = num(settings.min_order_amount, 0);
  const cod = settings.cod_enabled !== false; const online = isRazorpayConfigured() && settings.online_payments_enabled !== false;

  const faqs: FaqItem[] = [
    { id: "delivery", q: "How long does delivery take?", a: `Our standard delivery target is ${etaMin}–${etaMax} minutes. It depends on stock, packing time, distance and rider availability. Express (where your area supports it) is ${xMin}–${xMax} minutes, and scheduled orders arrive in the slot you pick at checkout. Your order page shows the live ETA and the rider on the map once they're on the way.${freeAbove ? ` Delivery is free above ${formatINR(freeAbove)}.` : ""}${minOrder ? ` Minimum order is ${formatINR(minOrder)}.` : ""}` },
    { id: "payments", q: "Which payment methods can I use?", a: `${cod ? "Cash on Delivery is available — pay the rider when your order arrives." : "Cash on Delivery is currently switched off."} ${online ? "UPI, cards and net banking are available through Razorpay's secure checkout." : "Online payments (UPI, cards, net banking) will be available once Razorpay is enabled."} You can also pay from your Merta Deal wallet balance.` },
    { id: "otp", q: "What is the delivery OTP?", a: "Every order has a numeric delivery OTP shown on your order page. The rider enters it on their app to confirm the hand-over — that's what marks the order delivered. Share it only when the items are in your hands, and never over a phone call." },
    { id: "refunds", q: "How do refunds work?", a: "If a paid order is cancelled or an item is missing, the refund is issued to your original payment method (your bank usually posts it in 5–7 working days) or credited instantly to your Merta Deal wallet, depending on the case. COD orders have nothing to refund unless you paid the rider. Track refunds under Wallet, and raise a ticket if one is missing." },
    { id: "cancel", q: "Can I cancel my order?", a: "Yes — from the order page while it's still 'Placed' or 'Confirmed'. Once packing starts, the order can't be cancelled from the app; contact support and we'll sort it out." },
    { id: "contact", q: "How do I reach Merta Deal?", a: `Call ${phone}${whatsapp ? `, WhatsApp us on +${whatsapp}` : ""}, or email ${email}. For anything about a specific order, raise a ticket below so we can look it up straight away.` },
  ];

  return (
    <AccountSection title="Customer Support" action={<TicketForm orders={orderOptions} preselectOrder={sp.order} openInitially={Boolean(sp.order) || sp.new === "1"} />}>
      <div className="space-y-6 px-4 sm:px-0">
        <section className="grid gap-3 sm:grid-cols-3">
          <a href={`tel:${phone.replace(/\s/g, "")}`} className="flex items-center gap-3 rounded-lg border border-line bg-card p-4 shadow-card transition-shadow hover:shadow-float">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Phone className="h-5 w-5" /></span>
            <span className="min-w-0"><span className="block text-sm font-bold text-ink">Call support</span><span className="block truncate text-xs text-ink-3">{phone}</span></span>
          </a>
          {whatsapp ? (
            <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Hi Merta Deal, I need help with my order.")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-line bg-card p-4 shadow-card transition-shadow hover:shadow-float">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white"><WhatsAppIcon className="h-[22px] w-[22px]" /></span>
              <span className="min-w-0"><span className="block text-sm font-bold text-ink">WhatsApp</span><span className="block truncate text-xs text-ink-3">+{whatsapp}</span></span>
            </a>
          ) : null}
          <a href={`mailto:${email}`} className="flex items-center gap-3 rounded-lg border border-line bg-card p-4 shadow-card transition-shadow hover:shadow-float">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-saffron-100 text-saffron-700"><Mail className="h-5 w-5" /></span>
            <span className="min-w-0"><span className="block text-sm font-bold text-ink">Email</span><span className="block truncate text-xs text-ink-3">{email}</span></span>
          </a>
        </section>

        <section>
          <SectionHeader title="My tickets" subtitle={tickets.length ? `${tickets.length} ticket${tickets.length === 1 ? "" : "s"}` : undefined} className="px-0" />
          {tickets.length === 0 ? (
            <EmptyState icon={<LifeBuoy className="h-7 w-7" />} title="No tickets yet" description="Facing an issue with an order, payment or delivery? Raise a ticket and we'll reply on the thread." compact />
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-card shadow-card">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/account/support/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-ink">{t.subject}</p><Badge tone={TICKET_STATUS[t.status].tone} size="xs">{TICKET_STATUS[t.status].label}</Badge></div>
                      <p className="mt-0.5 text-xs text-ink-3">{t.ticket_number} · {TICKET_CATEGORY_LABEL[t.category] ?? t.category} · {formatDateTime(t.created_at)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Frequently asked" className="px-0" />
          <FaqAccordion items={faqs} />
        </section>
      </div>
    </AccountSection>
  );
}
