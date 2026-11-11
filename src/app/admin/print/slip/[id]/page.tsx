import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrderAdmin, adminRpc } from "@/lib/data/admin";
import { env } from "@/lib/env";
import { qrLabelSvg } from "@/lib/qr/generate";
import { orderQrValue } from "@/lib/scan/format";
import type { ScanOrder } from "@/lib/scan/types";
import type { AddressSnapshot } from "@/components/admin/order-summary";
import { paymentMethodLabel } from "@/components/admin/kit/status";
import { formatINR, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Packing slip" };

/**
 * A5 packing slip: the order QR (code only), what to pack with each item's SKU and size, the delivery
 * address for the bag, and sign-off lines. Scanning the QR opens the order for staff and for the
 * assigned rider; it carries no customer detail.
 */
export default async function PackingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [t, scan] = await Promise.all([getOrderAdmin(id), adminRpc<ScanOrder>("scan_order_detail", { p_order_id: id })]);
  if (!t || !scan.data) notFound();
  const o = t.order; const s = scan.data;
  const addr = o.address_snapshot as unknown as AddressSnapshot;
  const svg = await qrLabelSvg(orderQrValue(s.scan_code, env.siteUrl));
  const cod = o.payment_method === "cod";
  const totalQty = s.lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <>
      <style>{`@page { size: A5; margin: 8mm; } @media print { tr, .slip-panel, .slip-signoff { break-inside: avoid; } }`}</style>
      <article className="mx-auto my-5 w-[148mm] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-white p-5 text-ink shadow-card sm:p-7 print:my-0 print:w-auto print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="grid grid-cols-[minmax(0,1fr)_29mm] gap-4 border-b-2 border-brand-800 pb-4">
          <div className="min-w-0 self-center">
            <div className="flex flex-wrap items-center gap-2 text-[8pt] font-bold uppercase tracking-[0.13em] text-brand-800">
              <span>Merta Deal</span><span aria-hidden className="text-ink-4">/</span><span className="text-ink-3">Packing slip</span>
            </div>
            <h1 className="mt-2 break-all font-display text-[23pt] font-extrabold leading-none tracking-tight">{o.order_number}</h1>
            <div className="mt-2 space-y-0.5 text-[8.5pt] text-ink-2">
              <p>Placed <span className="font-semibold text-ink">{formatDateTime(o.created_at)}</span></p>
              {o.promised_at ? <p>Promised by <span className="font-semibold text-ink">{formatDateTime(o.promised_at)}</span></p> : null}
            </div>
            <div className={`mt-3 rounded-lg border px-3 py-2 ${cod ? "border-saffron-300 bg-saffron-50" : "border-brand-200 bg-brand-50"}`}>
              <p className="text-[7pt] font-bold uppercase tracking-wider text-ink-3">{cod ? "Cash to collect" : "Payment"}</p>
              <p className="mt-0.5 text-[10pt] font-bold leading-tight">{paymentMethodLabel(o.payment_method, true)}{cod ? ` · ${formatINR(Number(o.total))} in cash` : " · nothing to collect"}</p>
            </div>
          </div>
          <div className="justify-self-end text-center">
            <p className="mb-1 text-[7pt] font-bold uppercase tracking-wider text-ink-3">Scan order</p>
            <div className="h-[27mm] w-[27mm] rounded-md border border-line bg-white p-1 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="mt-1 break-all font-mono text-[6.5pt] text-ink-3">{s.scan_code}</p>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-[1.15fr_0.85fr] gap-2.5 text-[8.5pt]">
          <div className="slip-panel rounded-lg border border-line bg-surface px-3 py-2.5">
            <p className="text-[7pt] font-bold uppercase tracking-[0.12em] text-ink-3">Deliver to</p>
            <p className="mt-1 text-[10pt] font-bold">{addr?.full_name}</p>
            <p className="mt-0.5 font-semibold tabular-nums">{addr?.phone}</p>
            <p className="mt-1 leading-snug text-ink-2">{[addr?.house, addr?.street, addr?.landmark ? `near ${addr.landmark}` : null, addr?.area, addr?.city, addr?.pincode].filter(Boolean).join(", ")}</p>
          </div>
          <div className="slip-panel rounded-lg border border-line bg-surface px-3 py-2.5">
            <p className="text-[7pt] font-bold uppercase tracking-[0.12em] text-ink-3">Order summary</p>
            <p className="mt-1 text-[9pt] font-semibold">{s.item_count} item{s.item_count === 1 ? "" : "s"} · {totalQty} unit{totalQty === 1 ? "" : "s"}</p>
            <p className="mt-0.5 text-[8pt] text-ink-2">Order total <span className="font-bold text-ink">{formatINR(Number(o.total))}</span></p>
            {o.delivery_instructions ? <div className="mt-2 border-t border-line pt-1.5"><p className="text-[7pt] font-bold uppercase tracking-wider text-ink-3">Customer note</p><p className="mt-0.5 leading-snug">{o.delivery_instructions}</p></div> : null}
          </div>
        </section>

        <section className="mt-4" aria-label="Items to pack">
          <div className="mb-1.5 flex items-end justify-between gap-2">
            <h2 className="text-[8pt] font-bold uppercase tracking-[0.12em] text-ink-3">Pack and check each item</h2>
            <span className="text-[7.5pt] font-semibold text-ink-2">{totalQty} unit{totalQty === 1 ? "" : "s"} total</span>
          </div>
          <table className="w-full border-collapse text-[8.5pt]">
          <thead><tr className="border-y border-ink/70 bg-surface text-left text-[7pt] font-bold uppercase tracking-wider text-ink-3"><th className="w-9 py-1.5 pl-2 pr-1">Qty</th><th className="py-1.5 pr-2">Item</th><th className="w-[14%] py-1.5 pr-1">Size</th><th className="w-[21%] py-1.5 pr-1">SKU</th><th className="w-8 py-1.5 text-center">Done</th></tr></thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.id} className="border-b border-line align-middle">
                <td className="py-2 pl-2 pr-1 text-[12pt] font-extrabold tabular">{l.quantity}</td>
                <td className="py-2 pr-2"><span className="font-semibold leading-tight">{l.name}</span>{l.brand_name ? <span className="mt-0.5 block text-[7.5pt] text-ink-3">{l.brand_name}</span> : null}
                  {l.eggless ? <span className="mt-0.5 inline-block rounded-[2px] border border-ink px-1 text-[7pt] font-extrabold uppercase tracking-wide">Eggless</span> : null}
                  {l.cake_message ? <span className="mt-0.5 block text-[8.5pt] font-bold">Write on cake: “{l.cake_message}”</span> : null}</td>
                <td className="py-2 pr-1 font-semibold">{l.pack_label ?? "—"}</td>
                <td className="py-2 pr-1 font-mono text-[7.5pt]">{l.sku ?? "—"}</td>
                <td className="py-2 text-center"><span className="inline-block h-[5mm] w-[5mm] rounded-[2px] border-[1.2px] border-ink" aria-hidden /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </section>

        <footer className="mt-4">
          <div className="slip-signoff grid grid-cols-2 gap-5 text-[7.5pt] text-ink-2">
            <p className="border-t border-ink/70 pt-1.5">Packed by <span className="font-semibold">{s.packed_by_name ?? "________________"}</span>{s.packed_at ? <span className="mt-0.5 block text-[6.5pt] text-ink-3">{formatDateTime(s.packed_at)}</span> : null}</p>
            <p className="border-t border-ink/70 pt-1.5">Checked / handed over by <span className="font-semibold">________________</span></p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-2 text-[7pt] leading-snug text-ink-2">
            <p><span className="font-bold text-ink">Pack:</span> Scan in Admin › Scan, check every item, assign a rider, then confirm handover.</p>
            <p><span className="font-bold text-ink">Deliver:</span> Scan this slip at pickup. Complete delivery only with the customer&rsquo;s OTP.</p>
          </div>
        </footer>
      </article>
    </>
  );
}
