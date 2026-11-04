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
      <style>{`@page { size: A5; margin: 10mm; }`}</style>
      <article className="mx-auto my-4 w-[148mm] max-w-full bg-white p-[8mm] text-ink shadow-card print:my-0 print:w-auto print:p-0 print:shadow-none">
        <header className="flex items-start gap-4 border-b-2 border-ink pb-3">
          <div className="min-w-0 flex-1">
            <p className="text-[9pt] font-bold uppercase tracking-wider text-ink-3">Merta Deal · Packing slip</p>
            <h1 className="font-display text-[22pt] font-extrabold leading-none">{o.order_number}</h1>
            <p className="mt-1 text-[9pt] text-ink-2">Placed {formatDateTime(o.created_at)}{o.promised_at ? ` · promised by ${formatDateTime(o.promised_at)}` : ""}</p>
            <p className="mt-1 text-[10pt] font-bold">{paymentMethodLabel(o.payment_method, true)}{cod ? ` · collect ${formatINR(Number(o.total))} in cash` : " · prepaid, nothing to collect"}</p>
          </div>
          <div className="shrink-0 text-center">
            <div className="h-[30mm] w-[30mm] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="mt-1 font-mono text-[6.5pt] text-ink-3">{s.scan_code}</p>
          </div>
        </header>

        <section className="mt-3 grid grid-cols-2 gap-3 text-[9.5pt]">
          <div>
            <p className="text-[8pt] font-bold uppercase tracking-wider text-ink-3">Deliver to</p>
            <p className="font-bold">{addr?.full_name}</p>
            <p>{[addr?.house, addr?.street, addr?.landmark ? `near ${addr.landmark}` : null, addr?.area, addr?.city, addr?.pincode].filter(Boolean).join(", ")}</p>
          </div>
          <div>
            {o.delivery_instructions ? <><p className="text-[8pt] font-bold uppercase tracking-wider text-ink-3">Customer note</p><p>{o.delivery_instructions}</p></> : null}
            <p className="mt-1 text-[8pt] text-ink-3">{s.item_count} item{s.item_count === 1 ? "" : "s"} · {totalQty} unit{totalQty === 1 ? "" : "s"} · total {formatINR(Number(o.total))}</p>
          </div>
        </section>

        <table className="mt-3 w-full border-collapse text-[9.5pt]">
          <thead><tr className="border-b border-ink text-left text-[8pt] uppercase tracking-wider text-ink-3"><th className="w-10 py-1 pr-2">Qty</th><th className="py-1 pr-2">Item</th><th className="w-16 py-1 pr-2">Size</th><th className="w-20 py-1">SKU</th><th className="w-8 py-1 text-center">✓</th></tr></thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.id} className="border-b border-line align-top">
                <td className="py-1.5 pr-2 text-[11pt] font-extrabold tabular">{l.quantity}</td>
                <td className="py-1.5 pr-2"><span className="font-semibold">{l.name}</span>{l.brand_name ? <span className="block text-[8pt] text-ink-3">{l.brand_name}</span> : null}</td>
                <td className="py-1.5 pr-2 font-bold">{l.pack_label ?? ""}</td>
                <td className="py-1.5 font-mono text-[8pt]">{l.sku ?? "—"}</td>
                <td className="py-1.5 text-center"><span className="inline-block h-4 w-4 border border-ink" aria-hidden /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-5 grid grid-cols-2 gap-6 text-[8.5pt] text-ink-2">
          <p className="border-t border-ink pt-1">Packed by {s.packed_by_name ?? "______________"}{s.packed_at ? ` · ${formatDateTime(s.packed_at)}` : ""}</p>
          <p className="border-t border-ink pt-1">Checked / handed over by ______________</p>
          <p className="col-span-2 text-[7.5pt] text-ink-3">Staff: scan the QR in Admin › Scan to pack this order item by item, assign a rider and confirm the handover. Rider: scan it at pickup. Delivery is completed only with the customer&rsquo;s OTP.</p>
        </footer>
      </article>
    </>
  );
}
