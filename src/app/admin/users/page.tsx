import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { listUsers, spGet, spPage, type SP } from "@/lib/data/admin";
import { ListToolbar, ListPagination } from "@/components/admin/list-controls";
import { PageHeader, Avatar, Table } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ROLE_OPTIONS, ROLE_TONE } from "@/components/admin/constants";
import { EmptyState } from "@/components/ui/states";
import { formatINR, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Users" };


export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { items, total, page, pageSize } = await listUsers({ q: spGet(sp, "q"), role: spGet(sp, "role"), active: spGet(sp, "active"), page: spPage(sp) });
  return (
    <div className="space-y-4">
      <PageHeader title="Users" subtitle={`${total} accounts`} className="px-0" />
      <ListToolbar searchPlaceholder="Name, phone, email or referral code" filters={[{ key: "role", label: "Roles", options: ROLE_OPTIONS }, { key: "active", label: "Status", placeholder: "Active + inactive", options: [{ value: "1", label: "Active" }, { value: "0", label: "Deactivated" }] }]} />
      {items.length === 0 ? <EmptyState icon={<Users className="h-7 w-7" />} title="No users match" description="Try a different search or clear the filters." /> : (
        <Table keyField="id" rows={items as unknown as Record<string, unknown>[]} columns={[
          { key: "user", header: "User", render: (r) => { const u = r as unknown as (typeof items)[number]; return <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3"><Avatar name={u.full_name} src={u.avatar_url} size={34} /><span className="min-w-0"><span className="block truncate font-semibold text-ink">{u.full_name ?? "—"}{u.is_guest ? <span className="ml-1.5 text-[10px] font-bold uppercase text-ink-4">guest</span> : null}</span><span className="block truncate text-xs text-ink-3">{u.email ?? "no email"}</span></span></Link>; } },
          { key: "phone", header: "Phone", render: (r) => <span className="tabular">{(r.phone as string) ?? "—"}</span> },
          { key: "role", header: "Role", render: (r) => <Badge tone={ROLE_TONE[r.role as string] ?? "neutral"}>{String(r.role).replace("_", " ")}</Badge> },
          { key: "wallet_balance", header: "Wallet", className: "text-right", render: (r) => <span className="tabular">{formatINR(r.wallet_balance as number)}</span> },
          { key: "reward_points", header: "Points", className: "text-right", render: (r) => <span className="tabular">{r.reward_points as number}</span> },
          { key: "is_active", header: "Status", render: (r) => (r.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>) },
          { key: "created_at", header: "Joined", render: (r) => <span className="text-xs text-ink-3">{formatDate(r.created_at as string)}</span> },
        ]} />
      )}
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
