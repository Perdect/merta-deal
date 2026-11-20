import { TrendingUp, Info } from "lucide-react";
import { Panel, DetailList } from "@/components/admin/kit";
import { formatINR, formatNumber } from "@/lib/utils";

export type ProfitReport = {
  range: { start: string; end: string }; delivered_orders: number; sales: number; cogs: number; cogs_missing_lines: number; gross_profit: number; gross_margin_pct: number | null;
  delivery_fees_charged: number; platform_fees_charged: number; packaging: number; rider_costs: number; payment_fees: number; refunds: number; wastage: number; contribution: number;
  supplier_balance: number; rider_payable: number; rider_cash_due: number; costing_method: string; distance_basis: string; notes: string[];
};

/** Profit view for a date range. Server component; the numbers come from admin_profit_report (cost-authorised admins only). */
export function ProfitPanel({ r }: { r: ProfitReport }) {
  const money = (v: number) => formatINR(v, { precise: true });
  return (
    <Panel title={<span className="inline-flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-ink-3" aria-hidden />Profit</span>} description={`${formatNumber(r.delivered_orders)} delivered orders · costing: moving average · contribution is before fixed costs`}>
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailList items={[
          { label: "Product sales (after discounts)", value: money(r.sales) },
          { label: "Cost of goods sold", value: `− ${money(r.cogs)}` },
          { label: "Gross profit", value: <span className={Number(r.gross_profit) >= 0 ? "text-success" : "text-danger"}>{money(r.gross_profit)}{r.gross_margin_pct != null ? ` (${r.gross_margin_pct}%)` : ""}</span>, strong: true },
          { label: "Delivery + platform fees charged", value: `+ ${money(Number(r.delivery_fees_charged) + Number(r.platform_fees_charged))}` },
          { label: "Packaging", value: `− ${money(r.packaging)}` },
          { label: "Rider pay", value: `− ${money(r.rider_costs)}` },
          { label: "Payment gateway fees (estimate)", value: `− ${money(r.payment_fees)}` },
          { label: "Refunds", value: `− ${money(r.refunds)}` },
          { label: "Wastage (at cost)", value: `− ${money(r.wastage)}` },
          { label: "Contribution (not net profit)", value: <span className={Number(r.contribution) >= 0 ? "text-success" : "text-danger"}>{money(r.contribution)}</span>, strong: true },
        ]} />
        <div className="space-y-3">
          <DetailList items={[
            { label: "Owed to suppliers (posted receipts)", value: money(r.supplier_balance) },
            { label: "Owed to riders (payable)", value: money(r.rider_payable) },
            { label: "Cash with riders (COD to hand over)", value: money(r.rider_cash_due) },
          ]} />
          <ul className="space-y-1 rounded-lg bg-surface p-3 text-xs text-ink-2">
            {r.notes.map((n, i) => <li key={i} className="flex gap-1.5"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden />{n}</li>)}
            {r.cogs_missing_lines > 0 ? <li className="flex gap-1.5 font-semibold text-warning"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{r.cogs_missing_lines} order lines have no cost on record (sold before a goods receipt was posted for them); they count as zero cost here.</li> : null}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
