"use client";
import * as React from "react";
import { Tabs } from "@/components/ui/tabs";
import type { EarningsBucket } from "@/lib/data/store";
import { formatINR } from "@/lib/utils";

/** Day / week breakdown of gross → commission → net for delivered orders. */
export function EarningsTabs({ daily, weekly }: { daily: EarningsBucket[]; weekly: EarningsBucket[] }) {
  const [tab, setTab] = React.useState("daily");
  const rows = tab === "daily" ? daily : weekly;
  const max = Math.max(1, ...rows.map((r) => r.net));
  return (
    <section className="rounded-lg border border-line bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-5"><h2 className="text-base font-bold text-ink">Breakdown</h2><Tabs variant="pill" size="sm" items={[{ value: "daily", label: "Per day" }, { value: "weekly", label: "Per week" }]} value={tab} onChange={setTab} /></div>
      {rows.length === 0 ? <p className="px-4 py-6 text-sm text-ink-3 sm:px-5">No delivered orders in this period yet.</p> : (
        <div className="overflow-x-auto">
          <table className="mt-2 min-w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-2 font-semibold sm:px-5">{tab === "daily" ? "Day" : "Week"}</th><th className="px-2 py-2 text-right font-semibold">Orders</th><th className="px-2 py-2 text-right font-semibold">Gross</th><th className="px-2 py-2 text-right font-semibold">Commission</th><th className="px-4 py-2 text-right font-semibold sm:px-5">Net</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="px-4 py-2 sm:px-5"><p className="font-medium text-ink">{r.label}</p><div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, Math.round((r.net / max) * 100))}%` }} /></div></td>
                  <td className="px-2 py-2 text-right tabular text-ink-2">{r.orders}</td>
                  <td className="px-2 py-2 text-right tabular text-ink-2">{formatINR(r.gross)}</td>
                  <td className="px-2 py-2 text-right tabular text-danger">− {formatINR(r.commission)}</td>
                  <td className="px-4 py-2 text-right font-bold tabular text-ink sm:px-5">{formatINR(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
