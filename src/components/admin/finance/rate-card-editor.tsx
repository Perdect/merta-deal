"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Calculator, Plus, Trash2, Save } from "lucide-react";
import { Panel } from "@/components/admin/kit";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { rateCalcAction, saveRateCardAction, type RateRules, type PayBreakdown } from "@/lib/actions/finance";
import { formatINR, formatDateTime } from "@/lib/utils";

export type RateCardRow = { id: string; version: number; name: string; rules: RateRules; is_active: boolean; note: string | null; created_by_name: string | null; created_at: string };
type Zone = { id: string; name: string };

/**
 * Rider pay rules with a calculator. Rules that combine: base (or the zone rate instead of it) +
 * distance beyond the included km + one heavy-order supplement + one peak-hour supplement. Failed
 * attempts, cancellations after pickup and return trips are paid instead of the delivery, never on
 * top. Distance is store-to-customer straight-line km, as the app measures it today.
 */
export function RateCardEditor({ active, versions, zones, isSuper }: { active: RateCardRow | null; versions: RateCardRow[]; zones: Zone[]; isSuper: boolean }) {
  const router = useRouter();
  const [rules, setRules] = React.useState<RateRules>(active?.rules ?? { base: 20, included_km: 0, per_km: 5, zone_rates: [], weight_supplement: { min_kg: 0, amount: 0 }, peak: [], failed_attempt: 0, cancelled_after_pickup: 0, return_trip: 0, incentives: [] });
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [calc, setCalc] = React.useState({ km: "3.5", kg: "4", zone: "" });
  const [result, setResult] = React.useState<PayBreakdown | null>(null);
  const [busy, setBusy] = React.useState<"calc" | "save" | null>(null);
  const num = (v: string) => (v === "" ? 0 : Number(v));

  const run = async () => {
    setBusy("calc");
    try {
      const r = await rateCalcAction(rules, calc.km === "" ? null : Number(calc.km), num(calc.kg), calc.zone || null);
      if (!r.ok) { toast.error("Could not calculate", r.error); return; }
      setResult(r.data);
    } finally { setBusy(null); }
  };
  const save = async () => {
    setBusy("save");
    try {
      const r = await saveRateCardAction(name || `Rate card v${(active?.version ?? 0) + 1}`, rules, note);
      if (!r.ok) { toast.error("Not saved", r.error); return; }
      toast.success(`Rate card v${r.data.version} is now active`, "Deliveries accepted from now on are quoted with it; earlier quotes keep their own version.");
      setName(""); setNote(""); router.refresh();
    } finally { setBusy(null); }
  };
  const field = (label: string, key: keyof RateRules, hint?: string) => (
    <Input label={label} type="number" inputMode="decimal" min={0} step="0.5" value={String(rules[key] ?? "")} onChange={(e) => setRules({ ...rules, [key]: num(e.target.value) })} hint={hint} disabled={!isSuper} />
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Panel title="Per delivery" description="Zone rate replaces the base when the delivery address is in that zone; it is never added on top.">
          <div className="grid gap-3 sm:grid-cols-3">
            {field("Base per delivery (₹)", "base")}
            {field("Included distance (km)", "included_km", "Distance up to here is covered by the base.")}
            {field("Per extra km (₹)", "per_km", "Whole km beyond the included distance, rounded up.")}
          </div>
          <div className="mt-4">
            <p className="text-sm font-semibold text-ink">Zone rates (optional)</p>
            {rules.zone_rates.map((z, i) => (
              <div key={i} className="mt-2 grid grid-cols-[minmax(0,1fr)_40px] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_140px_40px]">
                <Select label="Zone" options={zones.map((x) => ({ value: x.id, label: x.name }))} placeholder="Choose a zone" value={z.zone_id} disabled={!isSuper} onChange={(e) => setRules({ ...rules, zone_rates: rules.zone_rates.map((r, j) => (j === i ? { ...r, zone_id: e.target.value } : r)) })} />
                <Input label="Base (₹)" type="number" min={0} step="0.5" value={z.base} disabled={!isSuper} onChange={(e) => setRules({ ...rules, zone_rates: rules.zone_rates.map((r, j) => (j === i ? { ...r, base: num(e.target.value) } : r)) })} />
                <button type="button" disabled={!isSuper} aria-label="Remove zone rate" className="tap mb-1 flex h-9 w-9 items-center justify-center rounded-md text-ink-3 hover:bg-danger-50 hover:text-danger" onClick={() => setRules({ ...rules, zone_rates: rules.zone_rates.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="mt-2" disabled={!isSuper || !zones.length} onClick={() => setRules({ ...rules, zone_rates: [...rules.zone_rates, { zone_id: zones[0]?.id ?? "", base: rules.base }] })}><Plus className="h-4 w-4" /> Add zone rate</Button>
          </div>
        </Panel>

        <Panel title="Supplements" description="Each is paid at most once per delivery.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Heavy order from (kg)" type="number" min={0} step="0.5" value={rules.weight_supplement.min_kg} disabled={!isSuper} onChange={(e) => setRules({ ...rules, weight_supplement: { ...rules.weight_supplement, min_kg: num(e.target.value) } })} hint="0 turns the supplement off." />
            <Input label="Heavy order supplement (₹)" type="number" min={0} step="0.5" value={rules.weight_supplement.amount} disabled={!isSuper} onChange={(e) => setRules({ ...rules, weight_supplement: { ...rules.weight_supplement, amount: num(e.target.value) } })} />
          </div>
          <p className="mt-4 text-sm font-semibold text-ink">Peak hours (IST)</p>
          {rules.peak.map((p, i) => (
            <div key={i} className="mt-2 grid grid-cols-[1fr_1fr_40px] items-end gap-2 sm:grid-cols-[1fr_1fr_120px_40px]">
              <Input label="From" type="time" value={p.start} disabled={!isSuper} onChange={(e) => setRules({ ...rules, peak: rules.peak.map((r, j) => (j === i ? { ...r, start: e.target.value } : r)) })} />
              <Input label="To" type="time" value={p.end} disabled={!isSuper} onChange={(e) => setRules({ ...rules, peak: rules.peak.map((r, j) => (j === i ? { ...r, end: e.target.value } : r)) })} />
              <Input label="Extra (₹)" type="number" min={0} step="0.5" value={p.amount} disabled={!isSuper} onChange={(e) => setRules({ ...rules, peak: rules.peak.map((r, j) => (j === i ? { ...r, amount: num(e.target.value) } : r)) })} />
              <button type="button" disabled={!isSuper} aria-label="Remove peak window" className="tap mb-1 flex h-9 w-9 items-center justify-center rounded-md text-ink-3 hover:bg-danger-50 hover:text-danger" onClick={() => setRules({ ...rules, peak: rules.peak.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="mt-2" disabled={!isSuper} onClick={() => setRules({ ...rules, peak: [...rules.peak, { start: "18:00", end: "21:00", amount: 5 }] })}><Plus className="h-4 w-4" /> Add peak window</Button>
        </Panel>

        <Panel title="When a delivery does not complete" description="Paid instead of the delivery pay, once per assignment.">
          <div className="grid gap-3 sm:grid-cols-3">
            {field("Failed attempt after pickup (₹)", "failed_attempt")}
            {field("Cancelled after pickup (₹)", "cancelled_after_pickup")}
            {field("Return trip (₹)", "return_trip", "Reserved for a future return-to-shop step.")}
          </div>
        </Panel>

        <Panel title="Daily incentives" description="Bonus when a rider completes this many deliveries in a day. Applied by the owner during settlement from the earnings report; not paid automatically yet.">
          {rules.incentives.map((inc, i) => (
            <div key={i} className="mt-2 grid grid-cols-[1fr_1fr_40px] items-end gap-2">
              <Input label="Deliveries per day" type="number" min={1} step="1" value={inc.daily_deliveries} disabled={!isSuper} onChange={(e) => setRules({ ...rules, incentives: rules.incentives.map((r, j) => (j === i ? { ...r, daily_deliveries: Math.max(1, Math.round(num(e.target.value))) } : r)) })} />
              <Input label="Bonus (₹)" type="number" min={0} step="1" value={inc.bonus} disabled={!isSuper} onChange={(e) => setRules({ ...rules, incentives: rules.incentives.map((r, j) => (j === i ? { ...r, bonus: num(e.target.value) } : r)) })} />
              <button type="button" disabled={!isSuper} aria-label="Remove incentive" className="tap mb-1 flex h-9 w-9 items-center justify-center rounded-md text-ink-3 hover:bg-danger-50 hover:text-danger" onClick={() => setRules({ ...rules, incentives: rules.incentives.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="mt-2" disabled={!isSuper} onClick={() => setRules({ ...rules, incentives: [...rules.incentives, { daily_deliveries: 10, bonus: 50 }] })}><Plus className="h-4 w-4" /> Add incentive</Button>
        </Panel>

        {isSuper ? (
          <Panel title="Save as a new version" description="Saving activates the new card for deliveries accepted from now on. Quotes already given keep their version.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Rate card v${(versions[0]?.version ?? 0) + 1}`} />
              <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this change" />
            </div>
            <Button className="mt-3" loading={busy === "save"} disabled={busy !== null} onClick={save}><Save className="h-4 w-4" /> Save and activate</Button>
          </Panel>
        ) : <p className="text-sm text-ink-3">Only a super admin can change rider rates.</p>}
      </div>

      <aside className="space-y-4">
        <Panel title="Calculator" description="Preview a payout with the rules above before saving.">
          <div className="grid grid-cols-2 gap-2">
            <Input label="Distance (km)" type="number" step="0.1" min={0} value={calc.km} onChange={(e) => setCalc({ ...calc, km: e.target.value })} hint="Empty = no map pin" />
            <Input label="Order weight (kg)" type="number" step="0.1" min={0} value={calc.kg} onChange={(e) => setCalc({ ...calc, kg: e.target.value })} />
          </div>
          <Select label="Zone" className="mt-2" options={zones.map((z) => ({ value: z.id, label: z.name }))} placeholder="No zone" value={calc.zone} onChange={(e) => setCalc({ ...calc, zone: e.target.value })} />
          <Button size="sm" className="mt-3" loading={busy === "calc"} disabled={busy !== null} onClick={run}><Calculator className="h-4 w-4" /> Calculate</Button>
          {result ? (
            <div className="mt-3 rounded-lg bg-surface p-3 text-sm">
              <ul className="space-y-1">{result.lines.map((l, i) => <li key={i} className="flex justify-between gap-2"><span className="text-ink-2">{l.label}</span><span className="tabular">{formatINR(l.amount)}</span></li>)}</ul>
              <p className="mt-2 flex justify-between border-t border-line pt-2 font-bold"><span>Rider gets</span><span className="tabular">{formatINR(result.amount)}</span></p>
              <p className="mt-1 text-[11px] text-ink-3">Distance basis: {result.basis === "straight_line" ? "straight-line km from the pickup point to the customer (the app does not measure road distance yet)" : result.basis}.</p>
            </div>
          ) : null}
        </Panel>
        <Panel title="Versions" flush>
          <ul className="divide-y divide-line border-t border-line text-sm">
            {versions.map((v) => (
              <li key={v.id} className="px-4 py-2 sm:px-5">
                <p className="flex items-center gap-2 font-medium text-ink">v{v.version} · {v.name}{v.is_active ? <Badge tone="success" size="xs">active</Badge> : null}</p>
                <p className="text-xs text-ink-3">{formatDateTime(v.created_at)}{v.created_by_name ? ` · ${v.created_by_name}` : ""}{v.note ? ` · ${v.note}` : ""} · base {formatINR(v.rules.base)} + {formatINR(v.rules.per_km)}/km after {v.rules.included_km} km</p>
              </li>
            ))}
          </ul>
        </Panel>
      </aside>
    </div>
  );
}
