import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Inbox } from "lucide-react";
import { spGet, type SP } from "@/lib/data/admin";
import { adminListBusinesses, adminListRequests } from "@/lib/data/directory";
import { AdminPageHeader, CellStack, DataTable, EmptyBlock, RowLink, StatusTabs, StatusText } from "@/components/admin/kit";
import { ListingReview } from "@/components/admin/directory/listing-review";
import { DIRECTORY } from "@/lib/directory";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Local businesses" };

const TABS = [{ value: "requests", label: "Requests" }, { value: "draft", label: "Drafts" }, { value: "published", label: "Published" }, { value: "archived", label: "Archived" }];

/** Directory approvals: requests from the public form become drafts, drafts become profiles once complete. */
export default async function AdminBusinessesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === spGet(sp, "tab")) ? spGet(sp, "tab") : "requests";
  const [list, requests] = await Promise.all([adminListBusinesses(), adminListRequests()]);
  const pending = requests.filter((r) => r.status === "pending");
  const count = (v: string) => (v === "requests" ? pending.length : list.items.filter((b) => b.status === v).length);
  return (
    <>
      <AdminPageHeader title="Local businesses" description="Hotels, restaurants and bakeries. Verify the contact details before publishing; the database refuses incomplete, unverified or duplicate profiles." actions={<Link href="/admin/businesses/new" className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white">Add business</Link>} />
      {list.notInstalled ? <EmptyBlock icon={Building2} title="The directory isn't switched on yet" description="Migration 0040 hasn't been applied to this database." /> : (
        <>
          <StatusTabs param="tab" defaultValue="requests" items={TABS.map((t) => ({ ...t, count: count(t.value) }))} />
          {tab === "requests" ? (
            pending.length ? <ul className="mt-4 space-y-3">{pending.map((r) => <li key={r.id} className="rounded-lg border border-line bg-card p-4"><p className="font-semibold text-ink">{r.business_name} <span className="text-sm font-normal text-ink-3">· {DIRECTORY[r.category].singular} · {r.kind === "update" ? "Change request" : "New listing"}</span></p><p className="mt-1 text-sm text-ink-2">{r.owner_name} · <a href={`tel:+91${r.owner_phone}`} className="font-medium text-brand-700 hover:underline">{r.owner_phone}</a>{r.whatsapp ? ` · WhatsApp ${r.whatsapp}` : ""}</p><p className="text-sm text-ink-2">{r.address}</p>{r.details ? <p className="mt-1 text-sm text-ink-3">{r.details}</p> : null}<p className="mt-1 text-xs text-ink-3" title={formatDateTime(r.created_at)}>{timeAgo(r.created_at)}</p><ListingReview id={r.id} /></li>)}</ul>
              : <EmptyBlock icon={Inbox} title="No requests waiting" description="Requests from the List Your Business form appear here." />
          ) : (
            <DataTable caption="Local businesses" rows={list.items.filter((b) => b.status === tab)} rowKey={(b) => b.id}
              empty={<EmptyBlock icon={Building2} title={`No ${tab} businesses`} description="Approve a request, or add a business yourself." />}
              columns={[
                { key: "name", header: "Business", render: (b) => <CellStack primary={b.name} secondary={DIRECTORY[b.category].singular} /> },
                { key: "status", header: "Status", render: (b) => <StatusText value={b.status} /> },
                { key: "updated", header: "Updated", hideBelow: "md", render: (b) => <span className="text-xs text-ink-3">{timeAgo(b.updated_at)}</span> },
                { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (b) => <RowLink href={`/admin/businesses/${b.id}`} label="Open" /> },
              ]} />
          )}
        </>
      )}
    </>
  );
}
