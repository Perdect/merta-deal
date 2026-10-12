import Link from "next/link";
import { User } from "lucide-react";
import type { SessionUser } from "@/lib/supabase/server";
import type { Address } from "@/types/app";
import { Logo, LogoMark } from "@/components/ui/misc";
import { SearchBar } from "./search-bar";
import { LocationPicker } from "./location-picker";
import { CartButton } from "./cart-button";
import { HideOnRoutes } from "./route-gate";
import { HeaderHeight } from "./header-height";

/**
 * Compact white sticky header. Mobile: logo · delivery estimate + location · cart, with a full-width
 * search below (Account is in the bottom bar). Desktop: one row. Orders and notifications live in Account.
 */
export function Header({ user, addresses, unread = 0, defaultEta }: { user: SessionUser | null; addresses: Address[]; unread?: number; defaultEta?: { min: number; max: number } }) {
  const accountLabel = user ? (unread > 0 ? `Account, ${unread} unread notifications` : "Account") : "Sign in";
  return (
    <header data-site-header="" className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <HeaderHeight />
      {/* Mobile — the product page brings its own floating controls instead. */}
      <HideOnRoutes prefixes={["/p/"]} fallback={<div className="px-4 py-2 md:hidden"><LocationPicker addresses={addresses} variant="strip" fallbackEta={defaultEta} signedIn={Boolean(user)} /></div>}>
        <div className="px-4 pb-2.5 pt-2 md:hidden">
          <div className="flex items-center gap-2">
            <Link href="/" aria-label="Merta Deal home" className="tap shrink-0"><LogoMark size={32} /></Link>
            <div className="min-w-0 flex-1"><LocationPicker addresses={addresses} variant="banner" fallbackEta={defaultEta} signedIn={Boolean(user)} /></div>
            <CartButton className="tap text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600" />
          </div>
          <div className="mt-2"><SearchBar compact /></div>
        </div>
      </HideOnRoutes>
      {/* Desktop */}
      <div className="hidden md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2.5">
          <Logo size="md" />
          <LocationPicker addresses={addresses} className="max-w-xs" fallbackEta={defaultEta} signedIn={Boolean(user)} />
          <div className="flex-1"><SearchBar compact /></div>
          <nav className="flex items-center gap-1" aria-label="Account and cart">
            <Link href={user ? "/account" : "/login"} aria-label={accountLabel} className="flex h-10 items-center gap-2 rounded-full px-2.5 text-ink-2 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600">
              <User className="h-5 w-5" strokeWidth={1.75} /><span className="text-sm font-semibold">{user ? (user.fullName?.split(" ")[0] ?? "Account") : "Sign in"}</span>
              {unread > 0 ? <span aria-hidden className="h-2 w-2 rounded-full bg-saffron-500" /> : null}
            </Link>
            <CartButton className="h-11 w-11 bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600" />
          </nav>
        </div>
      </div>
    </header>
  );
}
