"use client";
import * as React from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, LogOut, Menu, Settings, X, ChevronDown } from "lucide-react";
import { Logo, LogoMark, Avatar } from "@/components/ui/misc";
import { staffSignOutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { ADMIN_NAV, ADMIN_NAV_FOOTER, activeNavHref, breadcrumbs, type AdminNavItem } from "./nav";
import { AdminTrail } from "./client";
import { OrderAlerts } from "@/components/admin/alerts/order-alerts";
import { AlertBanner, type PushConfig } from "@/components/alerts/alert-setup";

/* Collapsed state lives in localStorage (a per-admin convenience). useSyncExternalStore keeps the
   server render (expanded) and the client in agreement without a hydration mismatch. */
const KEY = "md-admin-sidebar-collapsed";
const listeners = new Set<() => void>();
function readCollapsed() { try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; } }
function writeCollapsed(v: boolean) { try { window.localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ } listeners.forEach((l) => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

type ShellUser = { name: string | null; email: string | null; role: string; avatarUrl?: string | null };

/**
 * Admin frame: light grouped sidebar (collapsible on desktop, drawer on smaller screens) and a
 * compact top bar with breadcrumbs, notifications, the customer site and the account menu.
 * Page headings live in each page (AdminPageHeader), never here, so there is exactly one h1.
 */
export function AdminShell({ user, userId, unread, push, children }: { user: ShellUser; userId: string; unread: number; push: PushConfig; children: React.ReactNode }) {
  const pathname = usePathname();
  const collapsed = React.useSyncExternalStore(subscribe, readCollapsed, () => false);
  const [drawer, setDrawer] = React.useState(false);
  const [prevPath, setPrevPath] = React.useState(pathname);
  if (prevPath !== pathname) { setPrevPath(pathname); setDrawer(false); }
  useBackToClose(drawer, () => setDrawer(false));
  const active = activeNavHref(pathname);
  const crumbs = breadcrumbs(pathname);

  React.useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [drawer]);

  return (
    <div className="flex min-h-dvh bg-[#f4f5f3] text-ink">
      <React.Suspense fallback={null}><AdminTrail /></React.Suspense>
      <a href="#admin-main" className="sr-only z-[70] rounded-md bg-card px-3 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-card transition-[width] duration-200 motion-reduce:transition-none lg:flex", collapsed ? "w-[72px]" : "w-60")} aria-label="Admin navigation">
        <div className={cn("flex h-14 items-center border-b border-line", collapsed ? "justify-center px-2" : "gap-2 px-4")}>
          {collapsed ? <Link href="/admin" aria-label="Merta Deal admin home"><LogoMark size={30} /></Link> : <><Logo size="sm" /><span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">Admin</span></>}
        </div>
        <SidebarNav active={active} collapsed={collapsed} />
        <div className="border-t border-line p-2">
          <button type="button" onClick={() => writeCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} className={cn("group relative flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600", collapsed && "justify-center px-0")}>
            {collapsed ? <ChevronsRight className="h-[18px] w-[18px]" /> : <><ChevronsLeft className="h-[18px] w-[18px]" />Collapse</>}
            {collapsed ? <Tip>Expand sidebar</Tip> : null}
          </button>
        </div>
      </aside>

      {/* Mobile / tablet drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <div className="absolute inset-0 bg-ink/40 motion-safe:animate-fade-in" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[min(86vw,280px)] flex-col bg-card pb-[var(--safe-bottom)] pt-[env(safe-area-inset-top)] shadow-float motion-safe:animate-slide-in-left">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <span className="flex items-center gap-2"><Logo size="sm" /><span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">Admin</span></span>
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="tap flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2"><X className="h-5 w-5" /></button>
            </div>
            <SidebarNav active={active} collapsed={false} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" className="tap flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 lg:hidden"><Menu className="h-5 w-5" /></button>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-1 text-sm">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={c.href + i} className={cn("flex min-w-0 items-center gap-1", !last && i === 0 && "hidden sm:flex")}>
                    {i > 0 ? <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-ink-4", i === 1 && "hidden sm:block")} aria-hidden /> : null}
                    {last ? <span aria-current="page" className="truncate font-semibold text-ink">{c.label}</span> : <Link href={c.href} className="truncate text-ink-3 hover:text-ink">{c.label}</Link>}
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="flex items-center gap-1">
            <Link href="/" target="_blank" className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink md:inline-flex">
              <ExternalLink className="h-4 w-4" aria-hidden />Customer site
            </Link>
            <Link href="/admin/notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="tap group relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
              <Bell className="h-[18px] w-[18px]" />
              {unread > 0 ? <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">{unread > 9 ? "9+" : unread}</span> : null}
              <Tip below>Notifications</Tip>
            </Link>
            <AccountMenu user={user} />
          </div>
          </div>
        </header>
        <main id="admin-main" className="min-w-0 flex-1 px-3 py-4 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-5 sm:py-5 lg:px-7 lg:py-6">
          <div className="mx-auto w-full max-w-[1400px]"><AlertBanner portal="admin" push={push} href="/admin/notifications#alerts" />{children}</div>
        </main>
      </div>
      <OrderAlerts userId={userId} push={push} />
    </div>
  );
}

function SidebarNav({ active, collapsed }: { active: string | null; collapsed: boolean }) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3 no-scrollbar">
      {ADMIN_NAV.map((g) => (
        <div key={g.label} className="mb-3">
          {collapsed ? <div className="mx-3 mb-1.5 h-px bg-line first:hidden" aria-hidden /> : <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-4">{g.label}</p>}
          <ul className="space-y-0.5">{g.items.map((i) => <NavLink key={i.href} item={i} active={active === i.href} collapsed={collapsed} />)}</ul>
        </div>
      ))}
      <div className="mt-2 border-t border-line pt-3">
        <ul className="space-y-0.5">{ADMIN_NAV_FOOTER.map((i) => <NavLink key={i.href} item={i} active={active === i.href} collapsed={collapsed} />)}</ul>
      </div>
    </nav>
  );
}

function NavLink({ item, active, collapsed }: { item: AdminNavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link href={item.href} aria-current={active ? "page" : undefined} aria-label={collapsed ? item.label : undefined}
        className={cn("group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-600 pointer-coarse:h-11",
          collapsed && "justify-center px-0",
          active ? "bg-brand-50 text-brand-800" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
        <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-brand-600" : "text-ink-3 group-hover:text-ink-2")} strokeWidth={1.9} aria-hidden />
        {collapsed ? <Tip>{item.label}</Tip> : <span className="truncate">{item.label}</span>}
      </Link>
    </li>
  );
}

/** CSS-only tooltip; its parent needs `group relative`. Shown on hover and keyboard focus. */
export function Tip({ children, below }: { children: React.ReactNode; below?: boolean }) {
  return (
    <span role="tooltip" className={cn("pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 shadow-float transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
      below ? "left-1/2 top-full mt-1.5 -translate-x-1/2" : "left-full top-1/2 ml-2 -translate-y-1/2")}>{children}</span>
  );
}

/** Sign-out menu item: disabled with a pending label while the server action runs, so it can't be submitted twice. */
function SignOutItem() {
  const { pending } = useFormStatus();
  return (
    <button role="menuitem" type="submit" disabled={pending} aria-busy={pending || undefined} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-danger hover:bg-danger-50 disabled:opacity-60 pointer-coarse:min-h-11">
      <LogOut className="h-4 w-4" aria-hidden />{pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

function AccountMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const role = user.role === "super_admin" ? "Super admin" : "Admin";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="tap flex h-9 items-center gap-2 rounded-lg pl-1 pr-1.5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600 sm:pr-2">
        <Avatar name={user.name} src={user.avatarUrl} size={28} />
        <span className="hidden max-w-[140px] truncate text-sm font-semibold text-ink sm:block">{user.name ?? "Admin"}</span>
        <ChevronDown className="hidden h-4 w-4 text-ink-3 sm:block" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1.5 w-60 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-line bg-card py-1 shadow-float motion-safe:animate-pop">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-ink">{user.name ?? "Admin"}</p>
            <p className="truncate text-xs text-ink-3">{user.email ?? role} · {role}</p>
          </div>
          <Link role="menuitem" href="/admin/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 pointer-coarse:min-h-11"><Settings className="h-4 w-4" aria-hidden />Settings</Link>
          <Link role="menuitem" href="/" target="_blank" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 pointer-coarse:min-h-11 md:hidden"><ExternalLink className="h-4 w-4" aria-hidden />Customer site</Link>
          <form action={staffSignOutAction} className="border-t border-line"><input type="hidden" name="portal" value="admin" />
            <SignOutItem />
          </form>
        </div>
      ) : null}
    </div>
  );
}
