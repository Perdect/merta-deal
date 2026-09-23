import Link from "next/link";
import { Bell, ShoppingCart, User, Package, Timer } from "lucide-react";
import type { SessionUser } from "@/lib/supabase/server";
import type { Address } from "@/types/app";
import { Logo } from "@/components/ui/misc";
import { SearchBar } from "./search-bar";
import { LocationPicker } from "./location-picker";
import { CartCount } from "./cart-count";

/** Quick-commerce style header: brand band with delivery promise + location on mobile, single row on desktop. */
export function Header({ user, addresses, unread = 0 }: { user: SessionUser | null; addresses: Address[]; unread?: number }) {
  return (
    <header className="sticky top-0 z-30">
      {/* Mobile brand band */}
      <div className="bg-brand-700 text-white md:hidden">
        <div className="px-4 pt-2.5 pb-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-display text-[15px] font-extrabold leading-none"><Timer className="h-4 w-4 text-saffron-300" /> Delivery in 30–60 min</p>
              <LocationPicker addresses={addresses} light className="mt-1.5" />
            </div>
            <Link href="/account/notifications" aria-label="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white">
              <Bell className="h-5 w-5" />
              {unread > 0 ? <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-saffron-500 px-1 text-[10px] font-bold text-ink">{unread > 9 ? "9+" : unread}</span> : null}
            </Link>
            <Link href={user ? "/account" : "/login"} aria-label={user ? "Profile" : "Sign in"} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"><User className="h-5 w-5" /></Link>
          </div>
          <div className="mt-3"><SearchBar /></div>
        </div>
      </div>
      {/* Desktop bar */}
      <div className="hidden border-b border-line bg-card/95 backdrop-blur md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2.5">
          <Logo size="md" />
          <LocationPicker addresses={addresses} className="max-w-xs" />
          <div className="flex-1"><SearchBar compact /></div>
          <nav className="flex items-center gap-1" aria-label="Account">
            <Link href="/orders" className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2"><Package className="h-5 w-5" /> Orders</Link>
            <Link href="/account/notifications" aria-label="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"><Bell className="h-5 w-5" />{unread > 0 ? <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span> : null}</Link>
            <Link href="/cart" aria-label="Cart" className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"><ShoppingCart className="h-5 w-5" /><CartCount /></Link>
            <Link href={user ? "/account" : "/login"} className="flex h-10 items-center gap-2 rounded-full px-2 pr-3 text-ink-2 hover:bg-surface-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700"><User className="h-4.5 w-4.5" /></span><span className="text-sm font-semibold">{user ? (user.fullName?.split(" ")[0] ?? "Account") : "Sign in"}</span></Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
