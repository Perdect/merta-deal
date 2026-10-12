/** Brand + navigation configuration. Business rules (fees, thresholds) live in the `settings` table, not here. */
/** Marketing copy only — the live promise is `settings.delivery_eta_*` and each delivery zone. Keep in step with them. */
const DELIVERY_WINDOW = "20–25 minutes";
export const site = {
  name: "Merta Deal",
  /** Brand as written in the logo, titles and structured data (alternate: "Merta Deal"). */
  seoName: "MertaDeal",
  tagline: "Merta Ki Shopping, Ab Online.",
  description:
    `Order groceries, fresh fruits and vegetables from Merta Deal in Merta City, Rajasthan. Fast local delivery in ${DELIVERY_WINDOW}.`,
  deliveryWindow: DELIVERY_WINDOW,
  deliveryWindowShort: "20–25 min",
  city: "Merta City",
  state: "Rajasthan",
  defaultPincode: "341510",
  center: { lat: 26.6486, lng: 74.0334 },
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  locale: "en-IN",
  currency: "INR",
  supportPhone: "+91 88750 20202",
  supportEmail: "support@mertadeal.com",
} as const;

/** Mobile bottom navigation. Cart lives in the header and the floating cart bar; orders inside Account. */
export const customerNav = [
  { href: "/", label: "Home", icon: "home", match: ["/"] },
  { href: "/categories", label: "Categories", icon: "grid", match: ["/categories", "/c/", "/p/"] },
  { href: "/search", label: "Search", icon: "search", match: ["/search"] },
  { href: "/account", label: "Account", icon: "user", match: ["/account", "/orders", "/login", "/register", "/forgot-password", "/track"] },
] as const;

export const riderNav = [
  { href: "/rider", label: "Home", icon: "home" },
  { href: "/rider/deliveries", label: "Deliveries", icon: "bike" },
  { href: "/rider/earnings", label: "Earnings", icon: "wallet" },
  { href: "/rider/profile", label: "Profile", icon: "user" },
] as const;

export const storeNav = [
  { href: "/store", label: "Dashboard", icon: "layout" },
  { href: "/store/orders", label: "Orders", icon: "package" },
  { href: "/store/products", label: "Products", icon: "box" },
  { href: "/store/inventory", label: "Inventory", icon: "layers" },
  { href: "/store/customers", label: "Customers", icon: "users" },
  { href: "/store/payments", label: "Payments", icon: "credit-card" },
  { href: "/store/earnings", label: "Earnings", icon: "wallet" },
  { href: "/store/profile", label: "Store Profile", icon: "store" },
  { href: "/store/settings", label: "Settings", icon: "settings" },
] as const;

