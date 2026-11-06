import {
  Wallet,
  LayoutDashboard, BarChart3, ShoppingBag, MapPinned, Bike, Package, Camera, FolderTree, Tags,
  TicketPercent, Megaphone, Bell, CreditCard, LifeBuoy, Star, Users, Settings, ScrollText, ScanLine, Truck, Tag, IndianRupee, Inbox, Building2, type LucideIcon,
} from "lucide-react";

export type AdminNavItem = { href: string; label: string; icon: LucideIcon };
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

/** Sidebar groups. Every existing admin route appears exactly once. */
export const ADMIN_NAV: AdminNavGroup[] = [
  { label: "Overview", items: [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  ] },
  { label: "Operations", items: [
    { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
    { href: "/admin/requests", label: "Service requests", icon: Inbox },
    { href: "/admin/scan", label: "Scan", icon: ScanLine },
    { href: "/admin/delivery", label: "Delivery zones", icon: MapPinned },
    { href: "/admin/riders", label: "Riders", icon: Bike },
  ] },
  { label: "Catalogue", items: [
    { href: "/admin/products", label: "Products", icon: Package },
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
    { href: "/admin/purchasing", label: "Purchasing", icon: Truck },
    { href: "/admin/pricing", label: "Selling prices", icon: Tag },
    { href: "/admin/payments", label: "Payments", icon: CreditCard },
    { href: "/admin/payouts/riders", label: "Rider payouts", icon: Wallet },
    { href: "/admin/riders/rates", label: "Rider rates", icon: IndianRupee },
  ] },
  { label: "Customer Care", items: [
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

const ALL = [...ADMIN_NAV.flatMap((g) => g.items), ...ADMIN_NAV_FOOTER];

/** The most specific nav item for a path ("/admin/products/images" beats "/admin/products"). */
export function activeNavHref(pathname: string): string | null {
  let best: string | null = null;
  for (const i of ALL) {
    const hit = i.href === "/admin" ? pathname === "/admin" : pathname === i.href || pathname.startsWith(`${i.href}/`);
    if (hit && (!best || i.href.length > best.length)) best = i.href;
  }
  return best;
}

/** Breadcrumb trail derived from the URL: Admin › Section › Detail. */
export function breadcrumbs(pathname: string): { href: string; label: string }[] {
  const crumbs = [{ href: "/admin", label: "Admin" }];
  const active = activeNavHref(pathname);
  const item = ALL.find((i) => i.href === active);
  if (item && item.href !== "/admin") crumbs.push({ href: item.href, label: item.label });
  const rest = active ? pathname.slice(active.length).split("/").filter(Boolean) : [];
  if (rest.length) crumbs.push({ href: pathname, label: rest[0] === "new" ? "New" : "Details" });
  return crumbs;
}
