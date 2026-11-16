"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, SearchX, Ticket, Trash2 } from "lucide-react";
import { AdminPageHeader, DataTable, CellStack, EmptyBlock, ErrorBlock, ListToolbar, StatusTabs, ListPagination, IconAction, StatusPill, rupees, rupeesRounded, type Tone } from "@/components/admin/kit";
import { Input, Select, Switch, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { FormPanel, FieldGroup, toLocalInput, fromLocalInput, hasErrors, type Errors } from "@/components/admin/care/form-panel";
import { btn } from "@/components/admin/care/shared";
import { saveCouponAction, deleteCouponAction } from "@/lib/actions/admin";
import type { Coupon } from "@/types/app";
import type { CouponStats } from "@/lib/data/admin";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import { categoryOptions, type CategoryLike } from "@/lib/categories";

type Opt = { id: string; name: string };

/** Status in words: expiry wins, then the on/off switch, then usage and schedule. */
export function couponState(c: Pick<Coupon, "is_active" | "starts_at" | "expires_at" | "usage_limit" | "used_count">, now: number): { label: string; tone: Tone; detail?: string } {
  if (c.expires_at && Date.parse(c.expires_at) <= now) return { label: "Expired", tone: "neutral", detail: `Ended ${formatDate(c.expires_at)}` };
  if (!c.is_active) return { label: "Inactive", tone: "neutral", detail: "Switched off" };
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return { label: "Used up", tone: "amber", detail: "Usage limit reached" };
  if (Date.parse(c.starts_at) > now) return { label: "Scheduled", tone: "blue", detail: `Starts ${formatDate(c.starts_at)}` };
  return { label: "Active", tone: "green", detail: c.expires_at ? `Until ${formatDate(c.expires_at)}` : "No end date" };
}

type Form = {
  code: string; title: string; description: string; type: "percentage" | "fixed"; value: string; min_order_amount: string; max_discount: string;
  usage_limit: string; per_user_limit: string; category_id: string; starts_at: string; expires_at: string; first_order_only: boolean; is_active: boolean;
};
type Key = keyof Form;

const blank = (): Form => ({ code: "", title: "", description: "", type: "percentage", value: "10", min_order_amount: "0", max_discount: "", usage_limit: "", per_user_limit: "1", category_id: "", starts_at: toLocalInput(new Date().toISOString()), expires_at: "", first_order_only: false, is_active: true });
const fromCoupon = (c: Coupon): Form => ({ code: c.code, title: c.title, description: c.description ?? "", type: c.type, value: String(c.value), min_order_amount: String(c.min_order_amount ?? 0), max_discount: c.max_discount != null ? String(c.max_discount) : "", usage_limit: c.usage_limit != null ? String(c.usage_limit) : "", per_user_limit: String(c.per_user_limit ?? 1), category_id: c.category_id ?? "", starts_at: toLocalInput(c.starts_at), expires_at: toLocalInput(c.expires_at), first_order_only: c.first_order_only, is_active: c.is_active });

const num = (s: string) => (s.trim() === "" ? null : Number(s));
function validate(f: Form): Errors<Key> {
  const e: Errors<Key> = {};
  if (!/^[A-Z0-9_-]{3,24}$/.test(f.code)) e.code = "Use 3–24 capital letters, numbers, - or _.";
  if (f.title.trim().length < 2) e.title = "Enter a title of at least 2 characters.";
  else if (f.title.trim().length > 100) e.title = "Keep the title under 100 characters.";
  const v = num(f.value);
  if (v == null || !Number.isFinite(v) || v <= 0) e.value = "Enter a value above 0.";
  else if (f.type === "percentage" && v > 100) e.value = "A percentage can't be more than 100.";
  const min = num(f.min_order_amount);
  if (min != null && (!Number.isFinite(min) || min < 0)) e.min_order_amount = "Enter 0 or more.";
  const max = num(f.max_discount);
  if (max != null && (!Number.isFinite(max) || max <= 0)) e.max_discount = "Leave blank for no cap, or enter more than 0.";
  const lim = num(f.usage_limit);
  if (lim != null && (!Number.isInteger(lim) || lim < 1)) e.usage_limit = "Leave blank for unlimited, or enter a whole number of 1 or more.";
  const per = num(f.per_user_limit);
  if (per == null || !Number.isInteger(per) || per < 1) e.per_user_limit = "Enter a whole number of 1 or more.";
  if (!f.starts_at) e.starts_at = "Choose when the coupon starts.";
  if (f.expires_at && f.starts_at && Date.parse(fromLocalInput(f.expires_at)) <= Date.parse(fromLocalInput(f.starts_at))) e.expires_at = "The expiry must be after the start.";
  return e;
}

export function CouponWorkspace({ coupons, stats, categories, counts, total, page, pageSize, nowIso, filtered, error, retryHref }: {
  coupons: Coupon[]; stats: CouponStats; categories: CategoryLike[]; counts: Record<string, number>; total: number; page: number; pageSize: number;
  nowIso: string; filtered: boolean; error: boolean; retryHref: string;
}) {
  const router = useRouter();
  const now = Date.parse(nowIso);
  const [editing, setEditing] = React.useState<{ id: string | null; initial: Form; form: Form } | null>(null);
  const [errors, setErrors] = React.useState<Errors<Key>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [del, setDel] = React.useState<Coupon | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const open = (id: string | null, form: Form) => { setEditing({ id, initial: form, form }); setErrors({}); setServerError(null); };
  const set = <K extends Key>(k: K, v: Form[K]) => { setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e)); if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined })); };
  const dirty = Boolean(editing && JSON.stringify(editing.form) !== JSON.stringify(editing.initial));

  const save = async () => {
    if (!editing) return;
    const f = editing.form; const e = validate(f);
    setErrors(e); setServerError(null);
    if (hasErrors(e)) return;
    setSaving(true);
    const r = await saveCouponAction(editing.id, {
      code: f.code, title: f.title.trim(), description: f.description.trim() || null, type: f.type, value: Number(f.value), min_order_amount: num(f.min_order_amount) ?? 0,
      max_discount: num(f.max_discount), first_order_only: f.first_order_only, category_id: f.category_id || null,
      usage_limit: num(f.usage_limit), per_user_limit: Number(f.per_user_limit), starts_at: fromLocalInput(f.starts_at), expires_at: fromLocalInput(f.expires_at) || null, is_active: f.is_active,
    });
    setSaving(false);
    if (r.ok) { toast.success(editing.id ? `Coupon ${f.code} saved` : `Coupon ${f.code} created`); setEditing(null); router.refresh(); }
    else { setServerError(r.error); toast.error("Couldn't save the coupon", r.error); }
  };
  const remove = async () => {
    if (!del) return;
    setDeleting(true); const r = await deleteCouponAction(del.id); setDeleting(false);
    if (r.ok) { toast.success(`Coupon ${del.code} deleted`); setDel(null); router.refresh(); } else toast.error("Couldn't delete the coupon", r.error);
  };

  const f = editing?.form;
  const scope = (c: Coupon) => [c.first_order_only ? "First order only" : null, c.category_id ? categories.find((x) => x.id === c.category_id)?.name ?? "One category" : null].filter(Boolean).join(" · ") || "All orders";

  return (
    <>
      <AdminPageHeader title="Coupons" description="Discount codes customers enter at checkout. Usage figures come from orders."
        actions={<button type="button" className={btn.primary} onClick={() => open(null, blank())}><Plus className="h-4 w-4" aria-hidden />New coupon</button>} />

      <StatusTabs items={[{ value: "", label: "All", count: counts[""] ?? null }, { value: "active", label: "Active", count: counts.active ?? null }, { value: "inactive", label: "Inactive", count: counts.inactive ?? null }, { value: "expired", label: "Expired", count: counts.expired ?? null }]} />
      <ListToolbar searchPlaceholder="Search code or title" />

      {error ? <ErrorBlock title="Couldn't load coupons" description="The database didn't respond. Your filters are kept; try again." retryHref={retryHref} /> : (
        <DataTable caption="Coupons" rows={coupons} rowKey={(c) => c.id}
          empty={filtered
            ? <EmptyBlock icon={SearchX} title="No coupons match" description="Try another tab or clear the search." />
            : <EmptyBlock icon={Ticket} title="No coupons yet" description="Create a coupon to offer a discount at checkout." action={<button type="button" className={btn.primary} onClick={() => open(null, blank())}><Plus className="h-4 w-4" aria-hidden />New coupon</button>} />}
          columns={[
            { key: "code", header: "Code", render: (c) => <span className="block min-w-0 max-w-[240px]"><button type="button" onClick={() => open(c.id, fromCoupon(c))} className="block truncate font-mono text-sm font-bold tracking-wide text-ink hover:text-brand-700 hover:underline">{c.code}</button><span className="block truncate text-xs text-ink-3">{c.title}</span></span> },
            { key: "status", header: "Status", render: (c) => { const s = couponState(c, now); return <span className="flex flex-col items-start gap-0.5"><StatusPill tone={s.tone}>{s.label}</StatusPill>{s.detail ? <span className="hidden text-[11px] text-ink-4 sm:block">{s.detail}</span> : null}</span>; } },
            { key: "discount", header: "Discount", hideBelow: "sm", render: (c) => <CellStack primary={c.type === "percentage" ? `${c.value}% off` : `${rupees(c.value)} off`} secondary={[c.max_discount ? `Max ${rupees(c.max_discount)}` : null, Number(c.min_order_amount) ? `Min order ${rupees(c.min_order_amount)}` : null].filter(Boolean).join(" · ") || "No minimum"} /> },
            { key: "scope", header: "Applies to", hideBelow: "xl", render: (c) => <span className="text-xs text-ink-2">{scope(c)}</span> },
            { key: "usage", header: "Used", align: "right", hideBelow: "md", render: (c) => { const s = stats[c.id]; return <span className="block text-right"><span className="tabular font-medium text-ink">{formatNumber(c.used_count)}{c.usage_limit != null ? <span className="text-ink-4"> / {formatNumber(c.usage_limit)}</span> : null}</span><span className="block text-[11px] text-ink-3">{c.per_user_limit} per customer{s ? ` · ${formatNumber(s.unique_users)} customers` : ""}</span></span>; } },
            { key: "given", header: "Discount given", align: "right", hideBelow: "lg", render: (c) => { const s = stats[c.id]; return <span className="block text-right"><span className="tabular text-ink">{rupeesRounded(s?.discount_total ?? 0)}</span>{s?.last_used_at ? <span className="block text-[11px] text-ink-4" title={formatDateTime(s.last_used_at)}>Last used {formatDate(s.last_used_at)}</span> : null}</span>; } },
            { key: "valid", header: "Valid", hideBelow: "lg", render: (c) => <span className="whitespace-nowrap text-xs text-ink-3">{formatDate(c.starts_at)} – {c.expires_at ? formatDate(c.expires_at) : "no end"}</span> },
            { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (c) => (
              <span className="inline-flex items-center gap-0.5">
                <IconAction label={`Edit ${c.code}`} onClick={() => open(c.id, fromCoupon(c))}><Pencil className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
                <IconAction label={`Delete ${c.code}`} tone="danger" onClick={() => setDel(c)}><Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
              </span>
            ) },
          ]} />
      )}
      <ListPagination page={page} pageSize={pageSize} total={total} />

      <FormPanel open={Boolean(editing)} title={editing?.id ? `Edit ${editing.initial.code}` : "New coupon"} description={editing?.id ? "Changes apply to the next checkout." : "Customers enter the code at checkout."}
        dirty={dirty} saving={saving} error={serverError} onClose={() => setEditing(null)} onSubmit={save} submitLabel={editing?.id ? "Save changes" : "Create coupon"}>
        {f ? (
          <>
            <FieldGroup title="Code">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Code" required value={f.code} error={errors.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} placeholder="WELCOME50" className="font-mono" maxLength={24} hint="3–24 characters" />
                <Input label="Title" required value={f.title} error={errors.title} onChange={(e) => set("title", e.target.value)} placeholder="₹50 off your first order" maxLength={100} />
              </div>
              <Textarea label="Description (optional)" value={f.description} onChange={(e) => set("description", e.target.value)} className="min-h-16" maxLength={2000} />
            </FieldGroup>
            <FieldGroup title="Discount">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Type" options={[{ value: "percentage", label: "Percentage off" }, { value: "fixed", label: "Fixed amount off (₹)" }]} value={f.type} onChange={(e) => set("type", e.target.value as Form["type"])} />
                <Input label={f.type === "percentage" ? "Percent off" : "Amount off (₹)"} required type="number" inputMode="decimal" min={0} step="0.01" value={f.value} error={errors.value} onChange={(e) => set("value", e.target.value)} />
                <Input label="Minimum order (₹)" type="number" inputMode="decimal" min={0} step="0.01" value={f.min_order_amount} error={errors.min_order_amount} onChange={(e) => set("min_order_amount", e.target.value)} />
                <Input label="Maximum discount (₹)" type="number" inputMode="decimal" min={0} step="0.01" placeholder="No cap" value={f.max_discount} error={errors.max_discount} onChange={(e) => set("max_discount", e.target.value)} />
              </div>
            </FieldGroup>
            <FieldGroup title="Limits and scope">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Total uses" type="number" inputMode="numeric" min={1} step={1} placeholder="Unlimited" value={f.usage_limit} error={errors.usage_limit} onChange={(e) => set("usage_limit", e.target.value)} />
                <Input label="Uses per customer" required type="number" inputMode="numeric" min={1} step={1} value={f.per_user_limit} error={errors.per_user_limit} onChange={(e) => set("per_user_limit", e.target.value)} />
                {/* A coupon matches a product's own category, so a top-level line only matches
                    products filed directly in it — the shelf is almost always the right pick. */}
                <Select label="Category" placeholder="All categories" options={categoryOptions(categories, { topLabel: (name) => `${name} (this line only)` })}
                  hint="Matched against the product's own shelf, not the whole branch." value={f.category_id} onChange={(e) => set("category_id", e.target.value)} />
              </div>
              <Switch checked={f.first_order_only} onChange={(v) => set("first_order_only", v)} label="Only on a customer's first order" />
            </FieldGroup>
            <FieldGroup title="Schedule">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Starts" required type="datetime-local" value={f.starts_at} error={errors.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
                <Input label="Expires" type="datetime-local" value={f.expires_at} error={errors.expires_at} onChange={(e) => set("expires_at", e.target.value)} hint="Leave blank for no expiry" />
              </div>
              <Switch checked={f.is_active} onChange={(v) => set("is_active", v)} label={f.is_active ? "Active: customers can use it within the schedule" : "Inactive: customers can't use it"} />
            </FieldGroup>
          </>
        ) : null}
      </FormPanel>

      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} tone="danger" title={`Delete coupon ${del?.code ?? ""}?`} loading={deleting} confirmLabel="Delete coupon" onConfirm={remove}
        description="This permanently removes the code. Coupons already used on orders can't be deleted; switch them to inactive instead." />
    </>
  );
}
