import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import { listReviews, getReviewCounts, spGet, spPage, type SP } from "@/lib/data/admin";
import { ListToolbar, ListPagination, ParamTabs } from "@/components/admin/list-controls";
import { ReviewModerationButtons } from "@/components/admin/review-actions";
import { PageHeader, StarRating, Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Reviews" };

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = spGet(sp, "status") || "pending";
  const [{ items, total, page, pageSize }, counts] = await Promise.all([listReviews({ status, target: spGet(sp, "target"), page: spPage(sp) }), getReviewCounts()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Reviews" subtitle="Approved reviews appear on product and store pages and feed ratings." className="px-0" />
      <ParamTabs param="status" defaultValue="pending" items={[{ value: "pending", label: "Moderation queue", count: counts.pending }, { value: "approved", label: "Approved", count: counts.approved }, { value: "rejected", label: "Rejected", count: counts.rejected }]} />
      <ListToolbar searchKey={null} filters={[{ key: "target", label: "Targets", options: [{ value: "product", label: "Product" }, { value: "store", label: "Store" }, { value: "delivery", label: "Delivery" }] }]} />
      {items.length === 0 ? <EmptyState icon={<Star className="h-7 w-7" />} title={status === "pending" ? "Queue is empty" : `No ${status} reviews`} /> : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className="rounded-lg border border-line bg-card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <Avatar name={r.user?.full_name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-ink">{r.user?.full_name ?? "Customer"}</span><StarRating value={r.rating} /><Badge tone="neutral" size="xs">{r.target}</Badge><span className="text-xs text-ink-3">{formatDateTime(r.created_at)}</span></div>
                  <p className="text-xs text-ink-3">On {r.target === "product" && r.product ? <Link href={`/p/${r.product.slug}`} className="font-semibold text-brand-700">{r.product.name}</Link> : r.target === "store" && r.store ? <Link href={`/s/${r.store.slug}`} className="font-semibold text-brand-700">{r.store.name}</Link> : r.target === "delivery" && r.rider ? <Link href={`/admin/riders/${r.rider.id}`} className="font-semibold text-brand-700">{r.rider.user?.full_name ?? "rider"}</Link> : "—"}{r.order ? <> · <Link href={`/admin/orders/${r.order_id}`} className="hover:underline">{r.order.order_number}</Link></> : null}</p>
                  {r.title ? <p className="mt-2 text-sm font-semibold text-ink">{r.title}</p> : null}
                  {r.comment ? <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{r.comment}</p> : <p className="mt-1 text-sm italic text-ink-4">No comment — rating only.</p>}
                  {r.moderation_note ? <p className="mt-2 text-xs text-ink-3">Note: {r.moderation_note}</p> : null}
                </div>
                <ReviewModerationButtons reviewId={r.id} status={r.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
