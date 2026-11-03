import type { Metadata } from "next";
import { SearchX, Users } from "lucide-react";
import { spGet, spPage, type SP } from "@/lib/data/admin";
import { listUsersOps, countUsersByRole, listHref, type UserFilters } from "@/lib/data/admin-ops";
import { AdminPageHeader, DataTable, CellStack, RowLink, EmptyBlock, ErrorBlock, ListToolbar, StatusTabs, ListPagination, rupees } from "@/components/admin/kit";
import { RolePill, ActivePill, ROLE_LABEL } from "@/components/admin/ops/pills";
import { Avatar } from "@/components/ui/misc";
import { formatDate, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Users" };

const TABS = [
  { value: "", label: "All" },
  { value: "customer", label: "Customers" },
  { value: "rider", label: "Riders" },
  { value: "admins", label: "Admins" },
];

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters: UserFilters = { q: spGet(sp, "q"), role: spGet(sp, "role"), active: spGet(sp, "active"), guest: spGet(sp, "guest") };
  const [list, counts] = await Promise.all([listUsersOps({ ...filters, page: spPage(sp) }), countUsersByRole(filters)]);
  const { items, total, page, pageSize, error } = list;
  const here = listHref("/admin/users", sp);
  const filtered = Boolean(filters.q || filters.active || filters.guest);
  const rawRole = filters.role && !TABS.some((t) => t.value === filters.role) ? filters.role : "";

  return (
    <>
      <AdminPageHeader title="Users" description="Every account on Merta Deal: customers, riders and admins. Open a user to change their role, credit their wallet or deactivate them." />

      <StatusTabs param="role" items={TABS.map((t) => ({ ...t, count: counts[t.value] ?? null }))} />
      {rawRole ? <p className="-mt-1 mb-3 text-xs text-ink-3">Showing role: <span className="font-medium text-ink">{ROLE_LABEL[rawRole as keyof typeof ROLE_LABEL] ?? rawRole}</span></p> : null}

      <ListToolbar searchPlaceholder="Name, phone, email or referral code" filters={[
        { key: "active", label: "Account status", options: [{ value: "1", label: "Active" }, { value: "0", label: "Deactivated" }] },
        { key: "guest", label: "Account type", options: [{ value: "0", label: "Registered" }, { value: "1", label: "Guest checkout" }] },
      ]} />

      {error ? (
        <ErrorBlock title="Couldn't load users" description="The user list didn't load. Check your connection, then retry." retryHref={here} />
      ) : (
        <DataTable caption="Users" rows={items} rowKey={(u) => u.id}
          empty={filtered || filters.role
            ? <EmptyBlock icon={SearchX} title="No users match" description="Try another tab, remove a filter chip, or search by phone number or email." />
            : <EmptyBlock icon={Users} title="No users yet" description="Accounts appear here when people sign up or check out on the customer site." />}
          columns={[
            { key: "user", header: "User", render: (u) => (
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={u.full_name} src={u.avatar_url} size={34} className="shrink-0" />
                <CellStack primary={<>{u.full_name ?? "Unnamed user"}{u.is_guest ? <span className="ml-1.5 text-xs font-normal text-ink-3">(guest)</span> : null}</>} secondary={u.email ?? u.phone ?? "No email"} href={`/admin/users/${u.id}`} />
              </span>
            ) },
            { key: "phone", header: "Phone", hideBelow: "md", render: (u) => (u.phone ? <a href={`tel:${u.phone}`} className="tabular text-ink-2 hover:underline">{u.phone}</a> : <span className="text-ink-4">—</span>) },
            { key: "role", header: "Role", hideBelow: "sm", render: (u) => <RolePill role={u.role} /> },
            { key: "wallet", header: "Wallet", align: "right", hideBelow: "lg", render: (u) => <span className="tabular">{rupees(u.wallet_balance)}</span> },
            { key: "points", header: "Points", align: "right", hideBelow: "xl", render: (u) => <span className="tabular text-ink-3">{formatNumber(u.reward_points)}</span> },
            { key: "status", header: "Status", render: (u) => <ActivePill active={u.is_active} /> },
            { key: "joined", header: "Joined", hideBelow: "lg", render: (u) => <span className="whitespace-nowrap text-xs text-ink-3">{formatDate(u.created_at)}</span> },
            { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (u) => <RowLink href={`/admin/users/${u.id}`} label={`Open ${u.full_name ?? "user"}`}>Open</RowLink> },
          ]} />
      )}
      {!error ? <ListPagination page={page} pageSize={pageSize} total={total} /> : null}
    </>
  );
}
