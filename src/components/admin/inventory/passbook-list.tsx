import Link from "next/link";
import { ScrollText } from "lucide-react";
import { DataTable, EmptyBlock, StatusPill } from "@/components/admin/kit";
import { ProductThumb } from "@/components/admin/catalogue/bits";
import { PASSBOOK_KIND_LABEL, PASSBOOK_KIND_TONE, type PassbookEntry } from "@/lib/inventory";
import { formatDateTime, formatNumber } from "@/lib/utils";

const signed = (n: number) => (n > 0 ? `+${formatNumber(n)}` : n < 0 ? `−${formatNumber(Math.abs(n))}` : "0");

/** Append-only inventory passbook: every movement with the balances before and after (0048). */
export function PassbookList({ rows, filtered }: { rows: PassbookEntry[]; filtered: boolean }) {
  return (
    <DataTable caption="Inventory passbook" rows={rows} rowKey={(r) => String(r.id)}
      empty={filtered
        ? <EmptyBlock icon={ScrollText} title="No entries match" description="Clear the filters or search by product, order number or note." />
        : <EmptyBlock icon={ScrollText} title="No movements yet" description="Every order reservation, delivery, cancellation and manual change appears here as it happens." />}
      columns={[
        { key: "when", header: "When", render: (r) => <span className="whitespace-nowrap text-ink-2">{formatDateTime(r.created_at)}</span> },
        { key: "product", header: "Product", render: (r) => (
          <span className="flex min-w-0 items-center gap-2">
            <ProductThumb image={r.image_url} name={r.product_name ?? "Product"} pack={r.pack_label} className="h-8 w-8" />
            <span className="min-w-0"><Link href={`/admin/inventory?tab=passbook&inventory=${r.inventory_id}`} className="block truncate font-medium text-ink hover:text-brand-700">{r.product_name ?? "Removed product"}</Link>{r.pack_label ? <span className="block text-xs text-ink-3">{r.pack_label}</span> : null}</span>
          </span>
        ) },
        { key: "kind", header: "Movement", render: (r) => <StatusPill tone={PASSBOOK_KIND_TONE[r.kind] ?? "neutral"}>{PASSBOOK_KIND_LABEL[r.kind] ?? r.kind}</StatusPill> },
        { key: "delta", header: "Change", align: "right", render: (r) => (
          <span className="block text-right tabular leading-tight">
            {r.delta_available !== 0 ? <span className={`block font-semibold ${r.delta_available > 0 ? "text-success" : "text-danger"}`}>{signed(r.delta_available)} available</span> : null}
            {r.delta_reserved !== 0 ? <span className="block text-xs text-ink-2">{signed(r.delta_reserved)} reserved</span> : null}
          </span>
        ) },
        { key: "balances", header: "Balance after", align: "right", hideBelow: "sm", render: (r) => (
          <span className="block text-right tabular leading-tight">
            <span className="block text-ink">{formatNumber(r.available_after)} avail · {formatNumber(r.reserved_after)} res</span>
            <span className="block text-xs text-ink-3">{formatNumber(r.available_before)} / {formatNumber(r.reserved_before)} before · {formatNumber(r.physical_after)} physical</span>
          </span>
        ) },
        { key: "ref", header: "Reference", hideBelow: "lg", render: (r) => r.order_id
          ? <Link href={`/admin/orders/${r.order_id}`} className="font-medium text-brand-700">{r.order_number ?? "Order"}</Link>
          : <span className="text-ink-3">{r.reference_type ? r.reference_type.replace(/_/g, " ") : "—"}</span> },
        { key: "who", header: "By · note", hideBelow: "md", render: (r) => <span className="block max-w-[260px] text-ink-2"><span className="font-medium text-ink">{r.actor_name ?? "System"}</span>{r.note ? <span className="block truncate text-xs text-ink-3" title={r.note}>{r.note}</span> : null}</span> },
      ]} />
  );
}
