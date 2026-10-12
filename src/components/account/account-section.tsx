import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Content-panel header (back chevron + title) and padded body for one account section. */
export function AccountSection({ title, back = "/account", action, children }: { title: string; back?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line bg-card px-3 py-4 md:px-6">
        <Link href={back} aria-label="Back" className="tap flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-surface-2"><ChevronLeft className="h-5 w-5" /></Link>
        <h1 className="font-display text-xl font-bold text-ink">{title}</h1>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      <div className="p-4 md:p-6">{children}</div>
    </div>
  );
}
