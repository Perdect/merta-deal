"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Bell, ExternalLink, Menu, ChevronRight } from "lucide-react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Logo, LogoMark, Avatar } from "@/components/ui/misc";
import { BottomSheet } from "@/components/ui/overlay";
import { signOutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: string };

/** Routes that open as a full-screen form on phones (no bottom tabs, the form owns the bottom edge). */
const FULL_SCREEN = /^\/store\/products\/(new|[0-9a-f-]{36})$/;

/**
 * Store panel frame (green, labelled "Store panel" so it is never mistaken for the customer, admin or
 * delivery partner portals).
 * - Desktop (lg+): sidebar with every section, top bar with page title, customer-site link and alerts.
 * - Phones/tablets: compact header (store name + open state) and a bottom bar with the first `primary`
 *   sections plus "More", a sheet holding everything else. Product forms hide the bar (full screen).
 */
export function DashboardShell({ nav, title, badge, user, children, notificationsHref, unread = 0, storeName, primary = 3, fullScreen: forceFullScreen }: { nav: readonly NavItem[]; title: string; badge?: React.ReactNode; user: { name: string | null; role: string; avatarUrl?: string | null }; children: React.ReactNode; notificationsHref?: string; unread?: number; storeName?: string; primary?: number; fullScreen?: boolean }) {
  const pathname = usePathname();
  const [more, setMore] = React.useState(false);
  const [prevPath, setPrevPath] = React.useState(pathname);
  if (prevPath !== pathname) { setPrevPath(pathname); setMore(false); }
  const isActive = (href: string) => (href === nav[0].href ? pathname === href : pathname === href || pathname.startsWith(href + "/"));
  const tabs = nav.slice(0, primary);
  const rest = nav.slice(primary);
  const moreActive = rest.some((n) => isActive(n.href)) || (notificationsHref ? pathname.startsWith(notificationsHref) : false);
  const fullScreen = forceFullScreen ?? FULL_SCREEN.test(pathname);
  const current = nav.find((n) => isActive(n.href))?.label ?? title;
  const bell = notificationsHref ? (
    <Link href={notificationsHref} aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600">
      <Bell className="h-5 w-5" aria-hidden />
      {unread > 0 ? <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white" aria-hidden>{unread > 9 ? "9+" : unread}</span> : null}
    </Link>
  ) : null;

  return (
    <div className="flex min-h-dvh bg-surface">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-card lg:flex" aria-label="Store panel">
        <div className="flex h-16 items-center gap-2 px-5"><Logo /><span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-800">{title}</span></div>
        {storeName ? <p className="truncate px-5 pb-2 text-xs font-semibold text-ink-3" title={storeName}>{storeName}</p> : null}
        <nav className="flex-1 overflow-y-auto py-2" aria-label="Store sections">
          <ul className="space-y-0.5 px-2">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} aria-current={isActive(n.href) ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand-600", isActive(n.href) ? "bg-brand-50 text-brand-800" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
                  <DynamicIcon name={n.icon} className="h-[18px] w-[18px]" aria-hidden />{n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} src={user.avatarUrl} size={36} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{user.name ?? "User"}</p><p className="truncate text-xs capitalize text-ink-3">{user.role.replace("_", " ")}</p></div>
            <form action={signOutAction}><button type="submit" aria-label="Sign out" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600"><LogOut className="h-4 w-4" aria-hidden /></button></form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cn("sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur", fullScreen && "max-lg:hidden")} style={{ paddingTop: "var(--safe-top)" }}>
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
            <Link href={nav[0].href} className="flex min-w-0 items-center gap-2 lg:hidden" aria-label={`${title} home`}>
              <LogoMark size={30} />
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase leading-tight tracking-wide text-brand-800">{title}</span>
                <span className="block truncate text-sm font-bold leading-tight text-ink">{storeName ?? current}</span>
              </span>
            </Link>
            <div className="ml-1 hidden min-w-0 items-center gap-2 lg:flex"><h1 className="truncate text-base font-bold text-ink">{current}</h1>{badge}</div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <span className="lg:hidden">{badge}</span>
              <Link href="/" className="hidden h-11 items-center gap-1 rounded-full px-3 text-xs font-semibold text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600 lg:inline-flex"><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Customer site</Link>
              {bell}
            </div>
          </div>
        </header>

        <main id="main" className={cn("flex-1 px-4 py-4 sm:px-5 lg:px-8 lg:py-6", !fullScreen && "max-lg:pb-[calc(var(--store-tabs-h)+var(--safe-bottom)+16px)]")}>{children}</main>

        {!fullScreen ? (
          <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur lg:hidden" style={{ paddingBottom: "var(--safe-bottom)" }} aria-label="Store sections">
            <ul className="mx-auto grid max-w-xl" style={{ height: "var(--store-tabs-h)", gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
              {tabs.map((n) => {
                const on = isActive(n.href);
                return (
                  <li key={n.href}>
                    <Link href={n.href} aria-current={on ? "page" : undefined} className={cn("flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600", on ? "text-brand-800" : "text-ink-3")}>
                      <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", on && "bg-brand-100")}><DynamicIcon name={n.icon} className="h-5 w-5" aria-hidden /></span>{n.label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more} className={cn("flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600", moreActive ? "text-brand-800" : "text-ink-3")}>
                  <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", moreActive && "bg-brand-100")}><Menu className="h-5 w-5" aria-hidden /></span>More
                </button>
              </li>
            </ul>
          </nav>
        ) : null}
      </div>

      <BottomSheet open={more} onClose={() => setMore(false)} title="More" description={storeName ? `${title} · ${storeName}` : title}>
        <ul className="-mx-1 divide-y divide-line">
          {rest.map((n) => (
            <li key={n.href}>
              <Link href={n.href} aria-current={isActive(n.href) ? "page" : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-sm px-1 text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-brand-600", isActive(n.href) ? "text-brand-800" : "text-ink")}>
                <DynamicIcon name={n.icon} className="h-5 w-5 text-ink-3" aria-hidden /><span className="flex-1">{n.label}</span><ChevronRight className="h-4 w-4 text-ink-4" aria-hidden />
              </Link>
            </li>
          ))}
          {notificationsHref ? (
            <li><Link href={notificationsHref} className="flex min-h-12 items-center gap-3 rounded-sm px-1 text-[15px] font-medium text-ink focus-visible:outline-2 focus-visible:outline-brand-600"><Bell className="h-5 w-5 text-ink-3" aria-hidden /><span className="flex-1">Notifications{unread > 0 ? ` (${unread} unread)` : ""}</span><ChevronRight className="h-4 w-4 text-ink-4" aria-hidden /></Link></li>
          ) : null}
          <li><Link href="/" className="flex min-h-12 items-center gap-3 rounded-sm px-1 text-[15px] font-medium text-ink focus-visible:outline-2 focus-visible:outline-brand-600"><ExternalLink className="h-5 w-5 text-ink-3" aria-hidden /><span className="flex-1">Open customer site</span></Link></li>
          <li>
            <form action={signOutAction}><button type="submit" className="flex min-h-12 w-full items-center gap-3 rounded-sm px-1 text-left text-[15px] font-semibold text-danger focus-visible:outline-2 focus-visible:outline-brand-600"><LogOut className="h-5 w-5" aria-hidden /> Sign out <span className="ml-auto truncate text-xs font-normal text-ink-3">{user.name ?? ""}</span></button></form>
          </li>
        </ul>
      </BottomSheet>
    </div>
  );
}
