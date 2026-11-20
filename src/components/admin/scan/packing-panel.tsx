import Link from "next/link";
import { AlertTriangle, PackageCheck, Printer, ScanLine } from "lucide-react";
import { Panel } from "@/components/admin/kit/ui";
import { btn } from "@/components/admin/catalogue/bits";
import type { ScanOrder } from "@/lib/scan/types";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

const FLAG_LABEL: Record<string, string> = { wrong_product: "Wrong product", wrong_weight: "Wrong weight", extra: "Extra scan", unknown: "Unknown label" };

/** Order page: what the scans say about packing, with the slip and the Scan section one tap away. Server component. */
export function PackingPanel({ order: s }: { order: ScanOrder }) {
  const total = s.lines.reduce((n, l) => n + l.quantity, 0);
  const packed = s.lines.reduce((n, l) => n + l.packed_qty, 0);
  const packable = ["confirmed", "preparing"].includes(s.status);
  const started = packed > 0 || s.flags.length > 0 || Boolean(s.packed_at);
  return (
    <Panel title={<span className="inline-flex items-center gap-1.5"><PackageCheck className="h-4 w-4 text-ink-3" aria-hidden />Packing</span>}
      description={s.packed_at ? `Packed ${formatDateTime(s.packed_at)}${s.packed_by_name ? ` by ${s.packed_by_name}` : ""} · ${packed} of ${total} scanned` : started ? `${packed} of ${total} units scanned` : "Scan each product label against the order; the slip carries the order's QR."}
      actions={<>
        <a href={`/admin/print/slip/${s.id}`} target="_blank" rel="noopener" className={btn.outline}><Printer className="h-4 w-4" aria-hidden />Packing slip</a>
        {packable ? <Link href={`/admin/scan?order=${s.id}`} className={btn.primary}><ScanLine className="h-4 w-4" aria-hidden />Pack by scan</Link> : null}
      </>} flush>
      <ul className="divide-y divide-line border-t border-line text-sm">
        {s.lines.map((l) => {
          const done = l.packed_qty >= l.quantity;
          return (
            <li key={l.id} className="flex items-center gap-3 px-4 py-2 sm:px-5">
              <span className={cn("w-14 font-bold tabular", done ? "text-success" : l.packed_qty ? "text-saffron-700" : "text-ink-3")}>{l.packed_qty}/{l.quantity}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{l.name} <span className="text-xs text-ink-3">{l.pack_label ?? ""}</span>{l.exception && l.exception.status === "pending" ? <span className="ml-2 rounded-full bg-warning-50 px-1.5 py-0.5 text-[10px] font-semibold text-warning">customer deciding · {l.exception.available_qty} available</span> : null}</span>
              {l.bin_location ? <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-2" title="Bin / shelf">{l.bin_location}</span> : null}
              <span className="font-mono text-xs text-ink-4">{l.sku ?? ""}</span>
            </li>
          );
        })}
      </ul>
      {s.flags.length ? (
        <ul className="border-t border-line px-4 py-2 text-xs text-ink-3 sm:px-5">
          {s.flags.slice(0, 5).map((f, i) => <li key={i} className="flex items-start gap-1.5 py-0.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-saffron-700" aria-hidden /><span><strong className="text-ink-2">{FLAG_LABEL[f.result] ?? f.result}</strong> · {f.message} · {f.by ?? "staff"}, {timeAgo(f.at)}</span></li>)}
          {s.flags.length > 5 ? <li className="pt-1">{s.flags.length - 5} more in the Scan section.</li> : null}
        </ul>
      ) : null}
    </Panel>
  );
}
