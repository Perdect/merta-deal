"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut, Bell, ExternalLink } from "lucide-react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Logo, Avatar } from "@/components/ui/misc";
import { signOutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: string };

/**
 * Responsive dashboard frame for the store portal and admin panel:
 * desktop sidebar + top bar; mobile drawer + compact header + optional bottom tabs (first 5 items).
 */
export function DashboardShell({ nav, title, badge, user, children, notificationsHref, unread = 0, mobileTabs = true, accent = "brand" }: { nav: readonly NavItem[]; title: string; badge?: React.ReactNode; user: { name: string | null; role: string; avatarUrl?: string | null }; children: React.ReactNode; notificationsHref?: string; unread?: number; mobileTabs?: boolean; accent?: "brand" | "ink" }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const isActive = (href: string) => (href === nav[0].href ? pathname === href : pathname.startsWith(href));
  const renderNav = (onClick?: () => void) => (
    <ul className="space-y-0.5 px-2">
      {nav.map((n) => (
        <li key={n.href}>
          <Link href={n.href} onClick={onClick} aria-current={isActive(n.href) ? "page" : undefined} className={cn("flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition-colors", isActive(n.href) ? (accent === "ink" ? "bg-white/10 text-white" : "bg-brand-50 text-brand-700") : accent === "ink" ? "text-white/70 hover:bg-white/5 hover:text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
            <DynamicIcon name={n.icon} className="h-[18px] w-[18px]" />{n.label}
          </Link>
        </li>
      ))}
    </ul>
  );
  const sideBg = accent === "ink" ? "bg-ink text-white" : "bg-card";
  return (
    <div className="flex min-h-dvh bg-surface">
      <aside className={cn("hidden w-64 shrink-0 flex-col border-r border-line lg:flex", sideBg)}>
        <div className="flex h-16 items-center gap-2 px-5"><Logo light={accent === "ink"} /><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", accent === "ink" ? "bg-saffron-500 text-ink" : "bg-brand-100 text-brand-700")}>{title}</span></div>
        <nav className="flex-1 overflow-y-auto py-2">{renderNav()}</nav>
        <div className={cn("border-t px-4 py-3", accent === "ink" ? "border-white/10" : "border-line")}>
          <div className="flex items-center gap-3"><Avatar name={user.name} src={user.avatarUrl} size={36} /><div className="min-w-0 flex-1"><p className={cn("truncate text-sm font-semibold", accent === "ink" ? "text-white" : "text-ink")}>{user.name ?? "User"}</p><p className={cn("truncate text-xs capitalize", accent === "ink" ? "text-white/60" : "text-ink-3")}>{user.role.replace("_", " ")}</p></div><form action={signOutAction}><button type="submit" aria-label="Sign out" className={cn("rounded-full p-2", accent === "ink" ? "text-white/70 hover:bg-white/10" : "text-ink-3 hover:bg-surface-2")}><LogOut className="h-4 w-4" /></button></form></div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-card/95 px-3 backdrop-blur sm:px-5">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 lg:hidden"><Menu className="h-5 w-5" /></button>
          <div className="lg:hidden"><Logo size="sm" /></div>
          <div className="ml-1 hidden items-center gap-2 lg:flex"><h1 className="text-base font-bold text-ink">{nav.find((n) => isActive(n.href))?.label ?? title}</h1>{badge}</div>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/" className="hidden h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold text-ink-2 hover:bg-surface-2 sm:inline-flex"><ExternalLink className="h-3.5 w-3.5" /> Customer site</Link>
            {notificationsHref ? <Link href={notificationsHref} aria-label="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"><Bell className="h-5 w-5" />{unread > 0 ? <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span> : null}</Link> : null}
            <Link href="/" className="hidden h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold text-ink-2 hover:bg-surface-2 sm:hidden"><ExternalLink className="h-3.5 w-3.5" /></Link>
          </div>
        </header>
        <main className={cn("flex-1 px-3 py-4 sm:px-5 lg:px-8 lg:py-6", mobileTabs && "pb-24 lg:pb-6")}>{children}</main>
        {mobileTabs ? (
          <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur safe-bottom lg:hidden" aria-label="Sections">
            <ul className="grid grid-cols-5" style={{ height: 60 }}>
              {nav.slice(0, 5).map((n) => <li key={n.href}><Link href={n.href} className={cn("flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-semibold", isActive(n.href) ? "text-brand-700" : "text-ink-3")}><DynamicIcon name={n.icon} className="h-5 w-5" />{n.label}</Link></li>)}
            </ul>
          </nav>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <div className={cn("absolute inset-y-0 left-0 flex w-72 flex-col shadow-float animate-slide-in-right", sideBg)}>
            <div className="flex h-14 items-center justify-between px-4"><Logo size="sm" light={accent === "ink"} /><button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className={cn("rounded-full p-2", accent === "ink" ? "text-white" : "text-ink-2")}><X className="h-5 w-5" /></button></div>
            <nav className="flex-1 overflow-y-auto py-2">{renderNav(() => setOpen(false))}</nav>
            <form action={signOutAction} className="border-t border-line p-3"><button type="submit" className={cn("flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm font-semibold", accent === "ink" ? "text-white/80" : "text-ink-2")}><LogOut className="h-4 w-4" /> Sign out</button></form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
