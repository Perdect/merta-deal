import type { Metadata } from "next";
import { getReport, spGet, type SP } from "@/lib/data/admin";
import { ReportView } from "@/components/admin/report-view";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Reports" };

function istToday() { const t = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); return t; }
function iso(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = istToday(); const monthAgo = new Date(today); monthAgo.setDate(today.getDate() - 29);
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const start = valid(spGet(sp, "start")) ? spGet(sp, "start") : iso(monthAgo);
  const end = valid(spGet(sp, "end")) ? spGet(sp, "end") : iso(today);
  const report = await getReport(start, end);
  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Orders, money and partner performance for any date range (IST). Export to CSV for accounting." className="px-0" />
      <ReportView report={report} start={start} end={end} />
    </div>
  );
}
