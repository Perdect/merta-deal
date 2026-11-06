import type { Metadata } from "next";
import { Inbox, SearchX } from "lucide-react";
import { spGet, spPage, type SP } from "@/lib/data/admin";
import { countServiceRequests, getServiceRequest, listServiceRequests, REQUEST_TABS } from "@/lib/data/admin-requests";
import { AdminPageHeader, DataTable, CellStack, RowLink, EmptyBlock, ErrorBlock, DetailList, ListToolbar, StatusTabs, ListPagination, QuickView, StatusText } from "@/components/admin/kit";
import { hrefWith } from "@/components/admin/care/shared";
import { RequestControls } from "@/components/admin/request-controls";
import { KIND_LABEL, REQUEST_DESTINATION_LABEL, STATUS_LABEL, URGENCY_LABEL, waDigits, type RequestStatus } from "@/lib/service-requests";
import { formatDateTime, formatINR, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Service requests" };

const tabLabel = (t: string) => (t === "all" ? "All" : STATUS_LABEL[t as RequestStatus]);
const link = "font-medium text-brand-700 hover:underline";

/** Gift, sweets, bulk and pickup requests from the public service pages. Each one is confirmed by a person. */
export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = (REQUEST_TABS as readonly string[]).includes(spGet(sp, "status")) ? spGet(sp, "status") : "new";
  const q = spGet(sp, "q");
  const viewId = spGet(sp, "view");
  const validView = /^[0-9a-f-]{36}$/.test(viewId);
  const [list, counts, view] = await Promise.all([listServiceRequests({ status, q, page: spPage(sp) }), countServiceRequests(), validView ? getServiceRequest(viewId) : Promise.resolve(null)]);
  const viewHref = (id: string) => hrefWith("/admin/requests", sp, { view: id });

  return (
    <>
      <AdminPageHeader title="Service requests" description="Gift orders, sweets orders, bulk quotations and pickup and drop requests from the public pages. Call the customer, confirm the time and charge, then update the status." />
      {list.notInstalled ? (
        <EmptyBlock icon={Inbox} title="Requests aren't switched on yet" description="Migration 0039 hasn't been applied to this database. Until it is, the public forms send customers to WhatsApp and call." />
      ) : (
        <>
          <StatusTabs defaultValue="new" items={REQUEST_TABS.map((t) => ({ value: t, label: tabLabel(t), count: counts[t] ?? null }))} />
          <ListToolbar searchPlaceholder="Request number, name or phone" filters={[]} />
          {list.error ? <ErrorBlock title="Couldn't load requests" description="The database didn't respond. Try again." retryHref={hrefWith("/admin/requests", sp, { view: null })} /> : (
            <DataTable caption="Service requests" rows={list.items} rowKey={(r) => r.id} selectedKey={validView ? viewId : null}
              empty={q ? <EmptyBlock icon={SearchX} title="No requests match" description="Try another tab or search term." /> : <EmptyBlock icon={Inbox} title={`No ${tabLabel(status).toLowerCase()} requests`} description="Requests appear here when customers send them from the service pages." />}
              columns={[
                { key: "req", header: "Request", render: (r) => <CellStack primary={r.item_type} secondary={`${r.request_number} · ${KIND_LABEL[r.kind]}`} /> },
                { key: "who", header: "Customer", hideBelow: "md", render: (r) => <CellStack primary={r.customer_name} secondary={r.customer_phone} /> },
                { key: "when", header: "When", hideBelow: "lg", render: (r) => <span className="text-xs text-ink-2">{r.preferred_at ? formatDateTime(r.preferred_at) : URGENCY_LABEL[r.urgency]}</span> },
                { key: "status", header: "Status", render: (r) => <StatusText value={r.status} label={STATUS_LABEL[r.status]} /> },
                { key: "age", header: "Received", hideBelow: "lg", render: (r) => <span className="whitespace-nowrap text-xs text-ink-3" title={formatDateTime(r.created_at)}>{timeAgo(r.created_at)}</span> },
                { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (r) => <RowLink href={viewHref(r.id)} label="Open" /> },
              ]} />
          )}
          <ListPagination page={list.page} pageSize={list.pageSize} total={list.total} />
        </>
      )}

      {validView && view ? (
        <QuickView title={`${KIND_LABEL[view.kind]} ${view.request_number}`} description={`Received ${formatDateTime(view.created_at)}`}>
          <div className="space-y-5">
            <DetailList items={[
              { label: "Customer", value: view.customer_name },
              { label: "Mobile", value: <span className="inline-flex gap-3"><a href={`tel:+91${view.customer_phone}`} className={link}>{view.customer_phone}</a><a href={`https://wa.me/${waDigits(view.customer_phone)}`} target="_blank" rel="noopener noreferrer" className={link}>WhatsApp</a></span> },
              { label: view.kind === "pickup_drop" ? "Item" : "Needs", value: view.item_type },
              ...(view.quantity ? [{ label: "Quantity", value: view.quantity }] : []),
              ...(view.occasion ? [{ label: "Occasion", value: view.occasion }] : []),
              ...(view.pickup_location ? [{ label: "Pickup", value: view.pickup_location }] : []),
              { label: view.kind === "pickup_drop" ? "Drop" : "Deliver to", value: [view.destination !== "home" ? REQUEST_DESTINATION_LABEL[view.destination] : null, view.place_name, view.place_detail, view.drop_location].filter(Boolean).join(", ") },
              ...(view.via_reception ? [{ label: "Handover", value: "At reception" }] : []),
              ...(view.recipient_name ? [{ label: "Receiver", value: `${view.recipient_name}${view.recipient_phone ? `, ${view.recipient_phone}` : ""}` }] : []),
              ...(view.gift_message ? [{ label: "Gift message", value: view.gift_message }] : []),
              ...(view.context ? [{ label: "Sent from", value: view.context }] : []),
              { label: "How soon", value: URGENCY_LABEL[view.urgency] },
              ...(view.preferred_at ? [{ label: "Preferred time", value: formatDateTime(view.preferred_at) }] : []),
              ...(view.notes ? [{ label: "Customer notes", value: view.notes }] : []),
              ...(view.quoted_charge != null ? [{ label: "Charge told to customer", value: formatINR(view.quoted_charge, { precise: true }) }] : []),
            ]} />
            <RequestControls key={view.id} id={view.id} status={view.status} quotedCharge={view.quoted_charge} note={view.admin_note} />
          </div>
        </QuickView>
      ) : null}
    </>
  );
}
