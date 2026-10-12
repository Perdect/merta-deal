"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon, ShoppingBag, MessageCircleQuestion, MapPin, UserRound, Heart, Ticket, Star, Bell, Settings, Wallet, ChevronRight, UserPlus, Store, Bike, LayoutDashboard } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import { Avatar, Logo } from "@/components/ui/misc";
import { cn, formatINR } from "@/lib/utils";

const NAV = [
  { href: "/account/orders", label: "Orders", icon: ShoppingBag },
  { href: "/account/support", label: "Customer Support", icon: MessageCircleQuestion },
  { href: "/account/addresses", label: "Saved Addresses", icon: MapPin },
  { href: "/account/profile", label: "Profile", icon: UserRound },
];
const MORE = [
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/coupons", label: "Coupons & offers", icon: Ticket },
  { href: "/account/rewards", label: "Rewards", icon: Star },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
  { href: "/account/settings", label: "Settings & PIN", icon: Settings },
];
const WORKSPACE_ICON = { store: Store, bike: Bike, layout: LayoutDashboard } as const;
export type WorkspaceLink = { href: string; label: string; icon: keyof typeof WORKSPACE_ICON };

/**
 * Account area frame: sidebar (identity, wallet, section nav, log out) + content panel.
 * Desktop shows both side by side; on a phone the sidebar is the /account menu and each
 * section opens full-width with its own back button.
 */
export function AccountShell({ name, phone, avatarUrl, walletBalance, isGuest, workspace, children }: {
  name: string | null; phone: string | null; avatarUrl: string | null; walletBalance: number; isGuest: boolean; workspace: WorkspaceLink[]; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isRoot = pathname === "/account";
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const Item = ({ href, label, icon: Icon, compact }: { href: string; label: string; icon: LucideIcon; compact?: boolean }) => (
    <li>
      <Link href={href} aria-current={active(href) ? "page" : undefined} className={cn("flex items-center gap-4 px-6 transition-colors", compact ? "min-h-11 py-2.5 text-sm" : "min-h-12 py-4 text-[15px]", active(href) ? "bg-surface-2 font-semibold text-ink" : "font-medium text-ink-2 hover:bg-surface")}>
        <Icon className={cn("shrink-0 text-ink-2", compact ? "h-4 w-4" : "h-5 w-5")} strokeWidth={1.75} />
        <span className="flex-1">{label}</span>
        <ChevronRight className="h-4 w-4 text-ink-4 md:hidden" />
      </Link>
    </li>
  );

  return (
    <div className="mx-auto max-w-6xl md:my-6 md:grid md:grid-cols-[340px_1fr] md:overflow-hidden md:rounded-2xl md:border md:border-line md:bg-card md:shadow-card">
      <aside className={cn("bg-card md:border-r md:border-line", isRoot ? "block" : "hidden md:block")}>
        <div className="flex items-center gap-4 px-5 pb-4 pt-6">
          <Avatar name={name} src={avatarUrl} size={64} className="shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-display text-2xl font-bold text-ink">{name || (isGuest ? "Guest" : "Add your name")}</p>
            <p className="text-[15px] text-ink-3">{phone ? `+91 ${phone}` : "No mobile number yet"}</p>
          </div>
        </div>

        <Link href="/account/wallet" className="mx-4 block rounded-xl bg-surface p-4 shadow-card transition-shadow hover:shadow-float">
          <span className="flex items-center gap-2 text-[15px] font-bold text-ink"><Wallet className="h-5 w-5 text-brand-700" /> Merta Wallet <ChevronRight className="ml-auto h-4 w-4 text-ink-3" /></span>
          <span className="mt-3 flex items-center justify-between border-t border-dashed border-line-2 pt-3 text-sm text-ink-2">
            <span>Available balance: <b className="text-ink">{formatINR(walletBalance)}</b></span>
            <span className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white">Add balance</span>
          </span>
        </Link>

        {isGuest ? (
          <Link href="/account/settings#save-account" className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-saffron-300 bg-saffron-50 p-3 text-sm">
            <UserPlus className="h-5 w-5 shrink-0 text-saffron-700" /><span className="text-ink-2"><b className="text-ink">Save your account</b> — add a PIN to keep your orders and addresses on any device.</span>
          </Link>
        ) : null}

        <nav aria-label="Account sections" className="mt-4">
          <ul className="divide-y divide-line border-y border-line">{NAV.map((n) => <Item key={n.href} {...n} />)}</ul>
          {workspace.length ? <ul className="border-b border-line">{workspace.map((w) => <Item key={w.href} href={w.href} label={w.label} icon={WORKSPACE_ICON[w.icon]} />)}</ul> : null}
          <p className="px-6 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-3">More</p>
          <ul>{MORE.map((n) => <Item key={n.href} {...n} compact />)}</ul>
        </nav>

        <div className="flex flex-col items-center gap-6 px-6 py-8">
          <form action={signOutAction}><button type="submit" className="rounded-xl border-2 border-danger/70 px-8 py-2.5 text-sm font-bold text-danger transition-colors hover:bg-danger-50">Log Out</button></form>
          <Logo size="md" className="opacity-40 grayscale" />
        </div>
      </aside>

      <section className={cn("min-w-0 bg-surface md:min-h-[70vh] md:bg-card", isRoot ? "hidden md:block" : "block")}>{children}</section>
    </div>
  );
}
