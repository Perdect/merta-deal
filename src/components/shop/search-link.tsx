import Link from "next/link";
import { Search } from "lucide-react";

/** Search icon for compact top bars. */
export function SearchLink() {
  return <Link href="/search" aria-label="Search" className="tap flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2"><Search className="h-5 w-5" /></Link>;
}
