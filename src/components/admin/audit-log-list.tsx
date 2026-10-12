import * as React from "react";
import { StatusPill, type Tone } from "@/components/admin/kit";

/* Audit log presentation (server-safe): action pills and a before/after view of a change. */

export function actionTone(a: string): Tone {
  if (a === "delete" || /cancel|reject|suspend|fail|refund/.test(a)) return "red";
  if (a === "insert" || /create|approve|paid|verified/.test(a)) return "green";
  if (a.startsWith("dispatch")) return "amber";
  if (/broadcast|notify/.test(a)) return "violet";
  return "blue";
}

export function ActionPill({ action }: { action: string }) {
  return <StatusPill tone={actionTone(action)} className="font-mono">{action}</StatusPill>;
}

const IGNORED = new Set(["updated_at", "search_vector"]);
const fmt = (v: unknown) => (v === undefined ? "—" : v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v));
const asObj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Field names whose value differs between before and after (both must be objects). */
export function changedFields(before: unknown, after: unknown): string[] {
  const b = asObj(before); const a = asObj(after);
  if (!b || !a) return [];
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !IGNORED.has(k) && JSON.stringify(b[k]) !== JSON.stringify(a[k]));
}

/** Changed fields as a before/after table, followed by the full JSON payloads. */
export function AuditChanges({ before, after }: { before: unknown; after: unknown }) {
  const b = asObj(before) ?? {}; const a = asObj(after) ?? {};
  const changed = changedFields(before, after);
  return (
    <div className="space-y-4">
      {changed.length ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Changed fields ({changed.length})</h3>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-xs">
              <thead><tr className="bg-[#fafbfa] text-left text-ink-3"><th scope="col" className="px-2.5 py-1.5 font-semibold">Field</th><th scope="col" className="px-2.5 py-1.5 font-semibold">Before</th><th scope="col" className="px-2.5 py-1.5 font-semibold">After</th></tr></thead>
              <tbody className="divide-y divide-line">
                {changed.map((k) => (
                  <tr key={k} className="align-top">
                    <td className="px-2.5 py-1.5 font-mono text-ink-2">{k}</td>
                    <td className="max-w-[180px] break-words px-2.5 py-1.5 font-mono text-[#b4231b]"><span className="sr-only">Before: </span>{fmt(b[k])}</td>
                    <td className="max-w-[180px] break-words px-2.5 py-1.5 font-mono text-[#26782a]"><span className="sr-only">After: </span>{fmt(a[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <div className="grid gap-3">
        <JsonBlock label="Before" value={before} />
        <JsonBlock label="After" value={after} />
      </div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</h3>
      {value == null
        ? <p className="rounded-lg bg-surface px-3 py-2 text-xs text-ink-3">{label === "Before" ? "Nothing recorded (for example, a newly created record)." : "Nothing recorded (for example, a deleted record)."}</p>
        : <pre className="max-h-72 overflow-auto rounded-lg bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink-2">{JSON.stringify(value, null, 2)}</pre>}
    </section>
  );
}
