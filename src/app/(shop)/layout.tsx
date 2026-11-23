import { isRazorpayConfigured } from "@/lib/env";
import { getActiveCategorySlugs, getPublicSettings, getSearchHints } from "@/lib/data/catalog";
import { Header } from "@/components/shop/header";
import { BottomNav } from "@/components/shop/bottom-nav";
import { ChromePart, NavHistory, NavSpacer } from "@/components/shop/app-view";
import { MeProvider } from "@/components/shop/me-provider";
import { StickyCartBar } from "@/components/shop/sticky-cart-bar";
import { CartDrawerLazy } from "@/components/shop/cart-drawer-lazy";
import { Footer } from "@/components/shop/footer";
import { socialLinks } from "@/lib/social";
import { PwaClient } from "@/components/pwa/pwa-client";
import { ConnectionIndicator } from "@/components/pwa/connection-indicator";
import { UpdatePrompt } from "@/components/pwa/update-prompt";
import { ReferralCapture } from "@/components/account/referral-capture";

/**
 * The shop frame reads nothing about the visitor while rendering: settings and categories come from
 * the data cache, so the catalogue pages are static and served from the CDN. Who is signed in, their
 * cart, addresses and unread count arrive through `MeProvider` (`/api/me`) once the page is on screen.
 */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  // Delivery ETA is a business rule: it comes from the `settings` table, never the markup.
  const [settings, activeCategories, searchHints] = await Promise.all([getPublicSettings(), getActiveCategorySlugs(), getSearchHints()]);
  const num = (k: string, d: number) => { const v = Number(settings[k]); return Number.isFinite(v) && v > 0 ? v : d; };
  const defaultEta = { min: num("delivery_eta_min_minutes", 30), max: num("delivery_eta_max_minutes", 60) };
  const slots = Array.isArray(settings.scheduled_slots) ? (settings.scheduled_slots as string[]) : [];
  return (
    <MeProvider>
      <ReferralCapture />
      <NavHistory />
      <ChromePart part="header"><Header defaultEta={defaultEta} searchHints={searchHints} /></ChromePart>
      <main className="mx-auto w-full max-w-6xl flex-1 pb-2 sm:px-6 md:pb-10">{children}</main>
      <ChromePart part="footer"><Footer social={socialLinks(settings)} categories={[...activeCategories]} /></ChromePart>
      <ChromePart part="cartBar"><StickyCartBar /></ChromePart>
      <NavSpacer />
      <CartDrawerLazy razorpayEnabled={isRazorpayConfigured() && settings.online_payments_enabled !== false} codEnabled={settings.cod_enabled !== false} verifyMobile={settings.order_mobile_otp_required === true} hours={settings.business_open === false ? null : (settings.business_hours as { open: string; close: string } | undefined) ?? null} slots={slots} slotRules={{ leadMinutes: num("scheduled_slot_lead_minutes", 30), daysAhead: num("scheduled_days_ahead", 2) }} eta={defaultEta} />
      <ChromePart part="bottomNav"><BottomNav /></ChromePart>
      <PwaClient />
      <UpdatePrompt />
      <ConnectionIndicator />
    </MeProvider>
  );
}
