import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, SearchX, Star } from "lucide-react";
import { spGet, spPage, type SP, type ReviewRow } from "@/lib/data/admin";
import { listReviewsAdmin, countReviews, REVIEW_TABS } from "@/lib/data/admin-care";
import { AdminPageHeader, DataTable, EmptyBlock, ErrorBlock, ListToolbar, StatusTabs, ListPagination, StatusText } from "@/components/admin/kit";
import { ReviewModerationButtons } from "@/components/admin/review-actions";
import { Stars, hrefWith } from "@/components/admin/care/shared";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Reviews" };

const TAB_LABEL: Record<string, string> = { pending: "To moderate", approved: "Approved", rejected: "Rejected" };
const TARGET_LABEL: Record<string, string> = { product: "Product", delivery: "Delivery" };

function Target({ r }: { r: ReviewRow }) {
  const link = r.target === "product" && r.product ? <Link href={`/p/${r.product.slug}`} className="font-medium text-brand-700 hover:underline">{r.product.name}</Link>
    : r.target === "delivery" && r.rider ? <Link href={`/admin/riders/${r.rider.id}`} className="font-medium text-brand-700 hover:underline">{r.rider.user?.full_name ?? "Rider"}</Link>
        : <span className="text-ink-4">Removed</span>;
  return <span className="block min-w-0 max-w-[220px] truncate text-sm"><span className="text-ink-3">{TARGET_LABEL[r.target] ?? r.target}: </span>{link}</span>;
}

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = (REVIEW_TABS as readonly string[]).includes(spGet(sp, "status")) ? spGet(sp, "status") : "pending";
  const f = { target: spGet(sp, "target"), rating: spGet(sp, "rating"), q: spGet(sp, "q") };
  const [list, counts] = await Promise.all([listReviewsAdmin({ ...f, status, page: spPage(sp) }), countReviews(f)]);
  const filtered = Boolean(f.target || f.rating || f.q);

  return (
    <>
      <AdminPageHeader title="Reviews" description="Approved reviews appear on product pages and count towards ratings. Pending ones are hidden until you decide." />

      <StatusTabs defaultValue="pending" items={REVIEW_TABS.map((t) => ({ value: t, label: TAB_LABEL[t], count: counts[t] ?? null }))} />
      <ListToolbar searchPlaceholder="Search review text" filters={[
        { key: "target", label: "Reviewed", options: [{ value: "product", label: "Product" }, { value: "delivery", label: "Delivery" }] },
        { key: "rating", label: "Rating", options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} ${n === 1 ? "star" : "stars"}` })) },
      ]} />

      {list.error ? <ErrorBlock title="Couldn't load reviews" description="The database didn't respond. Your filters are kept; try again." retryHref={hrefWith("/admin/reviews", sp)} /> : (
        <DataTable caption="Reviews" rows={list.items} rowKey={(r) => r.id}
          empty={filtered
            ? <EmptyBlock icon={SearchX} title="No reviews match" description="Remove a filter chip or try different words." />
            : status === "pending"
              ? <EmptyBlock icon={CheckCircle2} title="Nothing to moderate" description="New reviews land here before they go public." />
              : <EmptyBlock icon={Star} title={`No ${status} reviews`} description="Reviews move here once moderated." />}
          columns={[
            { key: "review", header: "Review", render: (r) => (
              <div className="min-w-0 max-w-[520px] py-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><Stars value={r.rating} />{status !== "pending" ? <StatusText value={r.status} /> : null}</div>
                {r.title ? <p className="mt-1 text-sm font-semibold text-ink">{r.title}</p> : null}
                {r.comment ? <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink-2">{r.comment}</p> : <p className="mt-0.5 text-sm italic text-ink-4">No comment, rating only.</p>}
                {r.moderation_note ? <p className="mt-1 text-xs text-ink-3"><span className="font-medium">Moderation note:</span> {r.moderation_note}</p> : null}
                <div className="mt-1 space-y-0.5 md:hidden"><Target r={r} /><p className="text-xs text-ink-3">{r.user?.full_name ?? "Customer"} · {timeAgo(r.created_at)}</p></div>
              </div>
            ) },
            { key: "target", header: "Reviewed", hideBelow: "md", render: (r) => <span className="block"><Target r={r} />{r.order ? <Link href={`/admin/orders/${r.order_id}`} className="text-xs text-ink-3 hover:underline">Order {r.order.order_number}</Link> : null}</span> },
            { key: "by", header: "Customer", hideBelow: "lg", render: (r) => <span className="block text-sm text-ink-2">{r.user?.full_name ?? "Customer"}<span className="block text-xs text-ink-4" title={formatDateTime(r.created_at)}>{timeAgo(r.created_at)}</span></span> },
            { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (r) => <ReviewModerationButtons reviewId={r.id} status={r.status} who={r.user?.full_name ?? undefined} /> },
          ]} />
      )}
      <ListPagination page={list.page} pageSize={list.pageSize} total={list.total} />
    </>
  );
}
