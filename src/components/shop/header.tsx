import { Suspense } from "react";
import { AccountLink } from "./account-link";
import { Logo } from "@/components/ui/misc";
import { SearchBar } from "./search-bar";
import { LocationPicker } from "./location-picker";
import { CartButton } from "./cart-button";
import { HideOnRoutes } from "./route-gate";
import { HeaderHeight } from "./header-height";

/**
 * Compact white sticky header. Mobile: delivery location · cart, with a full-width search below
 * (Account is in the bottom bar). Desktop: one row. Orders and notifications live in Account.
 */
export function Header({ defaultEta }: { defaultEta?: { min: number; max: number } }) {
  return (
    <header data-site-header="" className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <HeaderHeight />
      {/* Mobile — the product page brings its own floating controls instead. */}
      <HideOnRoutes prefixes={["/p/"]} fallback={<div className="px-4 py-2 md:hidden"><Suspense fallback={null}><LocationPicker variant="strip" fallbackEta={defaultEta} /></Suspense></div>}>
        <div className="px-4 pb-2.5 pt-2 md:hidden">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1"><Suspense fallback={null}><LocationPicker variant="banner" fallbackEta={defaultEta} /></Suspense></div>
            {/* Account lives in the bottom bar on phones; the header keeps just the cart, with the same badge as the inner pages. */}
            <CartButton className="tap -mr-1 h-11 w-11 shrink-0 text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600 [&_svg]:h-6 [&_svg]:w-6" />
          </div>
          <div className="mt-2.5"><Suspense fallback={null}><SearchBar compact /></Suspense></div>
        </div>
      </HideOnRoutes>
      {/* Desktop */}
      <div className="hidden md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2.5">
          <Logo size="md" />
          <Suspense fallback={null}><LocationPicker className="max-w-xs" fallbackEta={defaultEta} /></Suspense>
          <div className="flex-1"><Suspense fallback={null}><SearchBar compact /></Suspense></div>
          <nav className="flex items-center gap-1" aria-label="Account and cart">
            <AccountLink />
            <CartButton className="h-11 w-11 bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600" />
          </nav>
        </div>
      </div>
    </header>
  );
}
