"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Search, User, type LucideIcon } from "lucide-react";
import { customerNav } from "@/config/site";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { useMeStore } from "@/stores/me-store";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = { home: Home, grid: LayoutGrid, search: Search, user: User };

/**
 * Compact bar docked to the bottom edge (phones and small tablets): Home, Categories, Search, Account.
 * Every tab is a full column, well over 44×44 px; it sits above the home indicator (safe area). Hidden
 * while the on-screen keyboard is open so it never sits on a form.
 * Unread notifications show as a dot on Account (the header has no account icon on phones).
 */
export function BottomNav() {
  const unread = useMeStore((s) => s.me?.unread ?? 0);
  const pathname = usePathname();
  const keyboard = useKeyboardOpen();
  const matches = (m: string) => (m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(m.endsWith("/") ? m : `${m}/`));
  const activeHref = customerNav.find((i) => i.match.some(matches))?.href;
  if (keyboard) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur md:hidden" style={{ paddingBottom: "var(--safe-bottom)", paddingLeft: "env(safe-area-inset-left, 0px)", paddingRight: "env(safe-area-inset-right, 0px)" }} aria-label="Primary">
      <ul className="mx-auto grid max-w-xl grid-cols-4" style={{ height: "var(--bottom-nav-h)" }}>
        {customerNav.map((item) => {
          const active = item.href === activeHref;
          const Icon = ICONS[item.icon];
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} aria-label={item.icon === "user" && unread > 0 ? `${item.label}, ${unread} unread notifications` : undefined}
                className={cn("relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand-600", active ? "text-brand-800" : "text-ink-3")}>
                <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none", active && "bg-brand-100 text-brand-800")}>
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.9} aria-hidden />
                  {item.icon === "user" && unread > 0 ? <span aria-hidden className="absolute right-2.5 top-0.5 h-2 w-2 rounded-full bg-saffron-500 ring-2 ring-card" /> : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
