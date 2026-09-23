"use client";
import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { AuditRow } from "@/lib/data/admin";
import { cn, formatDateTime } from "@/lib/utils";

const ACTION_TONE = (a: string): BadgeTone => (a === "delete" || a.includes("cancel") || a.includes("reject") || a.includes("suspend") ? "danger" : a === "insert" || a.includes("create") || a.includes("approve") ? "success" : a.startsWith("dispatch") ? "saffron" : "info");

/** Diff-friendly rendering: highlights keys whose value changed between before/after. */
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Record<string, unknown>; const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => k !== "updated_at" && k !== "search_vector");
  const changed = keys.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
  if (before && after && changed.length) {
    return (
      <table className="w-full text-xs"><thead><tr className="text-left text-ink-3"><th className="py-1 pr-3 font-semibold">Field</th><th className="py-1 pr-3 font-semibold">Before</th><th className="py-1 font-semibold">After</th></tr></thead>
        <tbody className="divide-y divide-line">{changed.map((k) => <tr key={k}><td className="py-1 pr-3 font-mono text-ink-2">{k}</td><td className="py-1 pr-3 font-mono text-danger">{fmt(b[k])}</td><td className="py-1 font-mono text-success">{fmt(a[k])}</td></tr>)}</tbody></table>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {before != null ? <div><p className="mb-1 text-[10px] font-bold uppercase text-ink-3">Before</p><pre className="max-h-64 overflow-auto rounded-sm bg-surface p-2 font-mono text-[11px] text-ink-2">{JSON.stringify(before, null, 2)}</pre></div> : null}
      {after != null ? <div><p className="mb-1 text-[10px] font-bold uppercase text-ink-3">After</p><pre className="max-h-64 overflow-auto rounded-sm bg-surface p-2 font-mono text-[11px] text-ink-2">{JSON.stringify(after, null, 2)}</pre></div> : null}
      {before == null && after == null ? <p className="text-xs text-ink-3">No payload recorded.</p> : null}
    </div>
  );
}
const fmt = (v: unknown) => (v == null ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function AuditLogList({ rows }: { rows: AuditRow[] }) {
  const [open, setOpen] = React.useState<Set<number>>(new Set());
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-card">
      {rows.map((r) => { const isOpen = open.has(r.id); return (
        <li key={r.id}>
          <button type="button" onClick={() => toggle(r.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface">
            {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />}
            <span className="w-36 shrink-0 text-xs tabular text-ink-3">{formatDateTime(r.created_at)}</span>
            <Badge tone={ACTION_TONE(r.action)} size="xs" className="shrink-0 font-mono">{r.action}</Badge>
            <span className="shrink-0 text-xs font-semibold text-ink">{r.entity}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-4">{r.entity_id ?? ""}</span>
            <span className="hidden shrink-0 text-xs text-ink-3 sm:inline">{r.actor?.full_name ?? (r.actor_id ? r.actor_id.slice(0, 8) : "system")}{r.actor_role ? <span className="text-ink-4"> · {r.actor_role}</span> : null}</span>
          </button>
          <div className={cn("border-t border-line bg-surface/60 px-4 py-3", !isOpen && "hidden")}>
            {isOpen ? <Diff before={r.before_data} after={r.after_data} /> : null}
            {r.ip_address ? <p className="mt-2 text-[10px] text-ink-4">IP {r.ip_address}</p> : null}
          </div>
        </li>
      ); })}
    </ul>
  );
}
