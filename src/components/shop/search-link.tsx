import Link from "next/link";
import { Search } from "lucide-react";

/** Search icon for compact top bars. With `scope`, it searches within that category. */
export function SearchLink({ scope }: { scope?: { slug: string; name: string } }) {
  const href = scope ? `/search?category=${encodeURIComponent(scope.slug)}` : "/search";
  return <Link href={href} aria-label={scope ? `Search in ${scope.name}` : "Search"} className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600"><Search className="h-5 w-5" aria-hidden /></Link>;
}
