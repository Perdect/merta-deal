import {
  Wallet,
  LayoutDashboard, BarChart3, ShoppingBag, MapPinned, Bike, Package, Camera, FolderTree, Tags,
  TicketPercent, Megaphone, Bell, CreditCard, LifeBuoy, Star, Users, Settings, ScrollText, ScanLine, Truck, Tag, IndianRupee, Inbox, Building2, type LucideIcon,
 Warehouse, Boxes } from "lucide-react";

/** Live counters the shell can show next to a nav item (filled by `getLiveCounts`). */
export type NavBadgeKey = "orders" | "requests" | "payments" | "wholesale";
export type AdminNavItem = { href: string; label: string; icon: LucideIcon; /** Which live count to show as a badge. */ badge?: NavBadgeKey };
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

/**
 * Daily work, always visible: the handful of screens an operator opens many times a day. Everything
 * else lives in collapsible groups below. Every existing admin route appears exactly once overall.
 */
export const ADMIN_NAV_DAILY: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag, badge: "orders" },
  { href: "/admin/scan", label: "Scan & pack", icon: ScanLine },
  { href: "/admin/requests", label: "Service requests", icon: Inbox, badge: "requests" },
  { href: "/admin/wholesale", label: "Wholesale", icon: Warehouse, badge: "wholesale" },
  { href: "/admin/riders", label: "Riders", icon: Bike },
  { href: "/admin/payments", label: "Payments", icon: CreditCard, badge: "payments" },
];

/** Less frequent tools, grouped; a group opens when its page is active or when the operator opens it. */
export const ADMIN_NAV: AdminNavGroup[] = [
  { label: "Catalogue", items: [
    { href: "/admin/products", label: "Products", icon: Package },
    { href: "/admin/inventory", label: "Inventory", icon: Boxes },
    { href: "/admin/products/images", label: "Photo studio", icon: Camera },
    { href: "/admin/categories", label: "Categories", icon: FolderTree },
    { href: "/admin/brands", label: "Brands", icon: Tags },
    { href: "/admin/businesses", label: "Local businesses", icon: Building2 },
  ] },
  { label: "Marketing", items: [
    { href: "/admin/coupons", label: "Coupons", icon: TicketPercent },
    { href: "/admin/promotions", label: "Promotions", icon: Megaphone },
    { href: "/admin/notifications", label: "Notifications", icon: Bell },
  ] },
  { label: "Finance", items: [
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
    { href: "/admin/purchasing", label: "Purchasing", icon: Truck },
    { href: "/admin/pricing", label: "Selling prices", icon: Tag },
    { href: "/admin/payouts/riders", label: "Rider payouts", icon: Wallet },
    { href: "/admin/riders/rates", label: "Rider rates", icon: IndianRupee },
  ] },
  { label: "Delivery setup", items: [
    { href: "/admin/delivery", label: "Delivery zones", icon: MapPinned },
  ] },
  { label: "Customer care", items: [
    { href: "/admin/support", label: "Support", icon: LifeBuoy },
    { href: "/admin/reviews", label: "Reviews", icon: Star },
    { href: "/admin/users", label: "Users", icon: Users },
  ] },
];

/** Pinned to the bottom of the sidebar (system pages, not daily workflows). */
export const ADMIN_NAV_FOOTER: AdminNavItem[] = [
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/audit-logs", label: "Audit logs", icon: ScrollText },
];

/** Shown in the phone bottom bar; the fifth slot opens the full menu. */
export const ADMIN_NAV_MOBILE: AdminNavItem[] = [ADMIN_NAV_DAILY[0], ADMIN_NAV_DAILY[1], ADMIN_NAV_DAILY[2], ADMIN_NAV_DAILY[3]];

const ALL = [...ADMIN_NAV_DAILY, ...ADMIN_NAV.flatMap((g) => g.items), ...ADMIN_NAV_FOOTER];

/** The most specific nav item for a path ("/admin/products/images" beats "/admin/products"). */
export function activeNavHref(pathname: string): string | null {
  let best: string | null = null;
  for (const i of ALL) {
    const hit = i.href === "/admin" ? pathname === "/admin" : pathname === i.href || pathname.startsWith(`${i.href}/`);
    if (hit && (!best || i.href.length > best.length)) best = i.href;
  }
  return best;
}

/** Which part of the sidebar a page belongs to: "Daily", a group label, or "System". */
export function navSectionFor(href: string | null): string | null {
  if (!href) return null;
  if (ADMIN_NAV_DAILY.some((i) => i.href === href)) return "Daily";
  if (ADMIN_NAV_FOOTER.some((i) => i.href === href)) return "System";
  return ADMIN_NAV.find((g) => g.items.some((i) => i.href === href))?.label ?? null;
}

/** Breadcrumb trail derived from the URL: Admin › (Group) › Section › Detail. */
export function breadcrumbs(pathname: string): { href: string; label: string }[] {
  const crumbs = [{ href: "/admin", label: "Admin" }];
  const active = activeNavHref(pathname);
  const item = ALL.find((i) => i.href === active);
  const group = ADMIN_NAV.find((g) => g.items.some((i) => i.href === active));
  if (group && item) crumbs.push({ href: group.items[0].href, label: group.label });
  if (item && item.href !== "/admin") crumbs.push({ href: item.href, label: item.label });
  const rest = active ? pathname.slice(active.length).split("/").filter(Boolean) : [];
  if (rest.length) crumbs.push({ href: pathname, label: rest[0] === "new" ? "New" : "Details" });
  return crumbs;
}
