"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Percent, MapPin, Star, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Switch, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { DOC_STATUS_TONE, DOC_TYPE_LABEL, STORE_STATUS_OPTIONS, STORE_STATUS_TONE } from "@/components/admin/constants";
import { setStoreStatusAction, setStoreCommissionAction, updateStoreAdminAction, reviewStoreDocumentAction } from "@/lib/actions/admin";
import type { Store } from "@/types/app";
import type { StoreDocument, StoreCommission } from "@/lib/data/admin";
import { formatDate, formatDateTime } from "@/lib/utils";

type Result = { ok: boolean; error?: string };

export function StoreAdminPanel({ store, zones, defaultCommission }: { store: Store; zones: { id: string; name: string; area: string }[]; defaultCommission: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState(store.status);
  const [statusNote, setStatusNote] = React.useState("");
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [rate, setRate] = React.useState(store.commission_rate != null ? String(store.commission_rate) : "");
  const [rateNote, setRateNote] = React.useState("");
  const [radius, setRadius] = React.useState(String(store.delivery_radius_km));
  const [zone, setZone] = React.useState(store.zone_id ?? "");
  const [prep, setPrep] = React.useState(String(store.avg_prep_minutes));
  const [minOrder, setMinOrder] = React.useState(store.min_order_amount != null ? String(store.min_order_amount) : "");

  const run = async (key: string, fn: () => Promise<Result>, okMsg: string) => {
    setBusy(key); const r = await fn(); setBusy(null);
    if (r.ok) { toast.success(okMsg); router.refresh(); return true; }
    toast.error(r.error ?? "Something went wrong"); return false;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-card p-4">
        <p className="mb-2 text-sm font-semibold text-ink">Store status</p>
        <div className="mb-2 flex items-center gap-2 text-sm"><Badge tone={STORE_STATUS_TONE[store.status]}>{store.status}</Badge>{store.status === "pending" ? <span className="text-xs text-ink-3">Review documents, then approve.</span> : null}</div>
        {store.status === "pending" ? (
          <div className="flex gap-2">
            <Button size="sm" loading={busy === "status"} onClick={() => run("status", () => setStoreStatusAction(store.id, "active"), "Store approved and notified")}><CheckCircle2 className="h-4 w-4" /> Approve</Button>
            <Button size="sm" variant="outline" className="text-danger" onClick={() => { setStatus("closed"); setStatusOpen(true); }}><XCircle className="h-4 w-4" /> Reject</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1"><Select aria-label="Status" options={STORE_STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value as Store["status"])} /></div>
            <Button variant="outline" disabled={status === store.status} onClick={() => setStatusOpen(true)}>Update</Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-card p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><Percent className="h-4 w-4 text-brand-600" /> Commission</p>
        <p className="mb-2 text-xs text-ink-3">Platform default is {defaultCommission}%. Leave blank to use the default. Each change is recorded in commission history.</p>
        <Input type="number" min={0} max={100} step="0.5" inputMode="decimal" placeholder={`Default (${defaultCommission}%)`} value={rate} onChange={(e) => setRate(e.target.value)} label="Rate (%)" />
        <Input className="mt-2" placeholder="Note (optional)" value={rateNote} onChange={(e) => setRateNote(e.target.value)} aria-label="Commission note" />
        <Button size="sm" className="mt-3" loading={busy === "rate"} onClick={() => run("rate", () => setStoreCommissionAction(store.id, rate === "" ? null : Number(rate), rateNote), "Commission updated").then((ok) => ok && setRateNote(""))}>Save commission</Button>
      </div>

      <div className="rounded-lg border border-line bg-card p-4 space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink"><MapPin className="h-4 w-4 text-brand-600" /> Delivery & listing</p>
        <Switch checked={store.is_featured} label="Featured store" onChange={(v) => run("featured", () => updateStoreAdminAction(store.id, { is_featured: v }), v ? "Marked as featured" : "Removed from featured")} />
        <Switch checked={store.is_open} label="Accepting orders (open)" onChange={(v) => run("open", () => updateStoreAdminAction(store.id, { is_open: v }), v ? "Store opened" : "Store closed for orders")} />
        <Input label="Delivery radius (km)" type="number" min={0.5} max={50} step="0.5" value={radius} onChange={(e) => setRadius(e.target.value)} />
        <Select label="Delivery zone" placeholder="No zone" options={zones.map((z) => ({ value: z.id, label: `${z.name} — ${z.area}` }))} value={zone} onChange={(e) => setZone(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Prep time (min)" type="number" min={1} max={240} value={prep} onChange={(e) => setPrep(e.target.value)} />
          <Input label="Min order (₹)" type="number" min={0} placeholder="Zone default" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
        </div>
        <Button size="sm" variant="secondary" loading={busy === "delivery"} onClick={() => run("delivery", () => updateStoreAdminAction(store.id, { delivery_radius_km: Number(radius), zone_id: zone || null, avg_prep_minutes: Number(prep), min_order_amount: minOrder === "" ? null : Number(minOrder) }), "Store settings saved")}>Save</Button>
      </div>

      <Modal open={statusOpen} onClose={() => setStatusOpen(false)} title={`Set status to ${status}`} size="sm" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setStatusOpen(false)}>Cancel</Button><Button fullWidth variant={status === "suspended" || status === "closed" ? "danger" : "primary"} loading={busy === "status"} onClick={() => run("status", () => setStoreStatusAction(store.id, status, statusNote), "Store status updated").then((ok) => { if (ok) { setStatusOpen(false); setStatusNote(""); } })}>Confirm</Button></div>}>
        <p className="mb-3 text-sm text-ink-2">The owner will be notified in-app. {status === "suspended" ? "Suspended stores disappear from the customer site and cannot receive orders." : status === "closed" ? "Closed stores are hidden permanently unless reactivated." : status === "active" ? "The store becomes visible to customers immediately." : "The store goes back under review."}</p>
        <Textarea label="Note to owner (optional)" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="e.g. FSSAI licence expired — upload a renewed copy." />
      </Modal>
    </div>
  );
}

export function StoreDocuments({ docs, urls }: { docs: StoreDocument[]; urls: Record<string, string | null> }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [reject, setReject] = React.useState<StoreDocument | null>(null);
  const [note, setNote] = React.useState("");
  const review = async (doc: StoreDocument, status: "verified" | "rejected", n?: string) => {
    setBusy(doc.id); const r = await reviewStoreDocumentAction(doc.id, status, n); setBusy(null);
    if (r.ok) { toast.success(status === "verified" ? "Document verified" : "Document rejected"); setReject(null); setNote(""); router.refresh(); } else toast.error(r.error);
  };
  if (!docs.length) return <p className="py-4 text-sm text-ink-3">No documents uploaded yet. Ask the owner to upload GST, PAN, FSSAI and bank proof from the store portal.</p>;
  return (
    <ul className="divide-y divide-line">
      {docs.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
          <FileText className="h-5 w-5 shrink-0 text-ink-3" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type} <Badge tone={DOC_STATUS_TONE[d.status]} size="xs" className="ml-1">{d.status}</Badge></p>
            <p className="text-xs text-ink-3">Uploaded {formatDateTime(d.created_at)}{d.review_note ? ` · Note: ${d.review_note}` : ""}</p>
          </div>
          {urls[d.id] ? <a href={urls[d.id]!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><ExternalLink className="h-3.5 w-3.5" /> View</a> : <span className="text-xs text-ink-4">File unavailable</span>}
          {d.status !== "verified" ? <Button size="xs" loading={busy === d.id} onClick={() => review(d, "verified")}>Verify</Button> : null}
          {d.status !== "rejected" ? <Button size="xs" variant="outline" className="text-danger" onClick={() => setReject(d)}>Reject</Button> : null}
        </li>
      ))}
      <Modal open={Boolean(reject)} onClose={() => setReject(null)} title="Reject document" size="sm" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" fullWidth loading={Boolean(busy)} onClick={() => reject && review(reject, "rejected", note)}>Reject</Button></div>}>
        <Textarea label="Reason (shown to the store)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Image is blurry — please re-upload a clear scan." />
      </Modal>
    </ul>
  );
}

export function CommissionHistory({ rows }: { rows: StoreCommission[] }) {
  if (!rows.length) return <p className="text-xs text-ink-3">No custom rate set yet.</p>;
  return (
    <ul className="space-y-1 text-xs">
      {rows.map((c) => <li key={c.id} className="flex justify-between gap-3"><span className="text-ink-2"><Star className="mr-1 inline h-3 w-3 text-saffron-500" />{c.rate}% from {formatDate(c.effective_from)}{c.note ? ` · ${c.note}` : ""}</span><span className="text-ink-4">{formatDate(c.created_at)}</span></li>)}
    </ul>
  );
}
