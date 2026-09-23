"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Ticket } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select, Switch, Textarea } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { saveCouponAction, deleteCouponAction, type CouponInput } from "@/lib/actions/admin";
import type { Coupon } from "@/types/app";
import type { CouponStats } from "@/lib/data/admin";
import { formatINR, formatDate, formatDateTime } from "@/lib/utils";

type Opt = { id: string; name: string };
const toLocal = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const blank = (): CouponInput => ({ code: "", title: "", description: "", type: "percentage", value: 10, min_order_amount: 0, max_discount: null, first_order_only: false, store_id: null, category_id: null, usage_limit: null, per_user_limit: 1, starts_at: toLocal(new Date().toISOString()), expires_at: "", is_active: true });

export function CouponManager({ coupons, stats, stores, categories }: { coupons: Coupon[]; stats: CouponStats; stores: Opt[]; categories: Opt[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ id: string | null; form: CouponInput } | null>(null);
  const [del, setDel] = React.useState<Coupon | null>(null);
  const [busy, setBusy] = React.useState(false);
  const set = <K extends keyof CouponInput>(k: K, v: CouponInput[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));
  const openEdit = (c: Coupon) => setEditing({ id: c.id, form: { code: c.code, title: c.title, description: c.description ?? "", type: c.type, value: c.value, min_order_amount: c.min_order_amount, max_discount: c.max_discount, first_order_only: c.first_order_only, store_id: c.store_id, category_id: c.category_id, usage_limit: c.usage_limit, per_user_limit: c.per_user_limit, starts_at: toLocal(c.starts_at), expires_at: toLocal(c.expires_at), is_active: c.is_active } });
  const save = async () => { if (!editing) return; setBusy(true); const r = await saveCouponAction(editing.id, editing.form); setBusy(false); if (r.ok) { toast.success(editing.id ? "Coupon saved" : "Coupon created"); setEditing(null); router.refresh(); } else toast.error(r.error); };
  const remove = async () => { if (!del) return; setBusy(true); const r = await deleteCouponAction(del.id); setBusy(false); if (r.ok) { toast.success("Coupon deleted"); setDel(null); router.refresh(); } else toast.error(r.error); };
  const f = editing?.form;
  const [now] = React.useState(() => Date.now());

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" onClick={() => setEditing({ id: null, form: blank() })}><Plus className="h-4 w-4" /> New coupon</Button></div>
      {coupons.length === 0 ? <div className="rounded-lg border border-line bg-card py-12 text-center text-sm text-ink-3"><Ticket className="mx-auto mb-2 h-7 w-7 text-ink-4" />No coupons match.</div> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {coupons.map((c) => {
            const s = stats[c.id]; const expired = c.expires_at ? new Date(c.expires_at).getTime() < now : false; const exhausted = c.usage_limit != null && c.used_count >= c.usage_limit;
            return (
              <li key={c.id} className="rounded-lg border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-base font-bold tracking-wide text-ink">{c.code}</p>
                    <p className="text-sm font-medium text-ink-2">{c.title}</p>
                    <p className="mt-1 flex flex-wrap gap-1">{c.is_active && !expired && !exhausted ? <Badge tone="success" size="xs">live</Badge> : <Badge tone="neutral" size="xs">{expired ? "expired" : exhausted ? "exhausted" : "inactive"}</Badge>}{c.first_order_only ? <Badge tone="info" size="xs">first order</Badge> : null}{c.store_id ? <Badge tone="brand" size="xs">{stores.find((x) => x.id === c.store_id)?.name ?? "store"}</Badge> : null}{c.category_id ? <Badge tone="brand" size="xs">{categories.find((x) => x.id === c.category_id)?.name ?? "category"}</Badge> : null}</p>
                  </div>
                  <span className="flex gap-0.5"><IconButton label="Edit" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></IconButton><IconButton label="Delete" className="h-8 w-8 text-danger" onClick={() => setDel(c)}><Trash2 className="h-4 w-4" /></IconButton></span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-ink-3">Discount</dt><dd className="font-semibold text-ink">{c.type === "percentage" ? `${c.value}%` : formatINR(c.value)}{c.max_discount ? ` (max ${formatINR(c.max_discount)})` : ""}</dd></div>
                  <div><dt className="text-ink-3">Min order</dt><dd className="font-semibold text-ink">{formatINR(c.min_order_amount)}</dd></div>
                  <div><dt className="text-ink-3">Limits</dt><dd className="font-semibold text-ink">{c.usage_limit ?? "∞"} total · {c.per_user_limit}/user</dd></div>
                  <div><dt className="text-ink-3">Used</dt><dd className="font-semibold text-ink">{c.used_count}{s ? ` (${s.unique_users} users)` : ""}</dd></div>
                  <div><dt className="text-ink-3">Discount given</dt><dd className="font-semibold text-ink">{formatINR(s?.discount_total ?? 0)}</dd></div>
                  <div><dt className="text-ink-3">Valid</dt><dd className="font-semibold text-ink">{formatDate(c.starts_at)} → {c.expires_at ? formatDate(c.expires_at) : "no end"}</dd></div>
                </dl>
                {s?.last_used_at ? <p className="mt-2 text-[11px] text-ink-4">Last used {formatDateTime(s.last_used_at)}</p> : null}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? "Edit coupon" : "New coupon"} size="lg" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setEditing(null)}>Cancel</Button><Button fullWidth loading={busy} onClick={save}>{editing?.id ? "Save" : "Create"}</Button></div>}>
        {f ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Code" required value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} placeholder="WELCOME50" className="font-mono" />
            <Input label="Title" required value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="₹50 off your first order" />
            <div className="sm:col-span-2"><Textarea label="Description" value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
            <Select label="Type" options={[{ value: "percentage", label: "Percentage off" }, { value: "fixed", label: "Fixed ₹ off" }]} value={f.type} onChange={(e) => set("type", e.target.value as "percentage" | "fixed")} />
            <Input label={f.type === "percentage" ? "Percent off" : "Amount off (₹)"} type="number" min={0} step="0.01" value={f.value as number} onChange={(e) => set("value", Number(e.target.value))} />
            <Input label="Minimum order (₹)" type="number" min={0} value={(f.min_order_amount as number) ?? 0} onChange={(e) => set("min_order_amount", Number(e.target.value))} />
            <Input label="Max discount (₹)" type="number" min={0} placeholder="No cap" value={(f.max_discount as number | null) ?? ""} onChange={(e) => set("max_discount", e.target.value === "" ? null : Number(e.target.value))} />
            <Input label="Total usage limit" type="number" min={1} placeholder="Unlimited" value={(f.usage_limit as number | null) ?? ""} onChange={(e) => set("usage_limit", e.target.value === "" ? null : Number(e.target.value))} />
            <Input label="Per-user limit" type="number" min={1} value={(f.per_user_limit as number) ?? 1} onChange={(e) => set("per_user_limit", Number(e.target.value))} />
            <Select label="Store-specific" placeholder="All stores" options={stores.map((s) => ({ value: s.id, label: s.name }))} value={f.store_id ?? ""} onChange={(e) => set("store_id", e.target.value || null)} />
            <Select label="Category-specific" placeholder="All categories" options={categories.map((c) => ({ value: c.id, label: c.name }))} value={f.category_id ?? ""} onChange={(e) => set("category_id", e.target.value || null)} />
            <Input label="Starts" type="datetime-local" required value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
            <Input label="Expires" type="datetime-local" value={f.expires_at ?? ""} onChange={(e) => set("expires_at", e.target.value)} hint="Leave blank for no expiry" />
            <Switch checked={Boolean(f.first_order_only)} onChange={(v) => set("first_order_only", v)} label="First order only" />
            <Switch checked={Boolean(f.is_active)} onChange={(v) => set("is_active", v)} label="Active" />
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} tone="danger" title={`Delete ${del?.code}?`} description="Coupons already used on orders cannot be deleted — deactivate them instead." confirmLabel="Delete" loading={busy} onConfirm={remove} />
    </div>
  );
}
