/** Brand + navigation configuration. Business rules (fees, thresholds) live in the `settings` table, not here. */
export const site = {
  name: "Merta Deal",
  tagline: "Merta Ki Shopping, Ab Online.",
  description:
    "Order groceries, masala, dairy, snacks and daily essentials from trusted Kirana stores in Merta City, Rajasthan. Fast local delivery in 30–60 minutes.",
  city: "Merta City",
  state: "Rajasthan",
  defaultPincode: "341510",
  center: { lat: 26.6486, lng: 74.0334 },
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locale: "en-IN",
  currency: "INR",
  supportPhone: "+91 98290 12345",
  supportEmail: "help@mertadeal.in",
} as const;

export const customerNav = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/categories", label: "Categories", icon: "grid" },
  { href: "/orders", label: "Orders", icon: "package" },
  { href: "/cart", label: "Cart", icon: "cart" },
  { href: "/account", label: "Profile", icon: "user" },
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

export const adminNav = [
  { href: "/admin", label: "Dashboard", icon: "layout" },
  { href: "/admin/orders", label: "Orders", icon: "package" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/stores", label: "Stores", icon: "store" },
  { href: "/admin/products", label: "Products", icon: "box" },
  { href: "/admin/products/images", label: "Photo studio", icon: "camera" },
  { href: "/admin/categories", label: "Categories", icon: "grid" },
  { href: "/admin/brands", label: "Brands", icon: "tag" },
  { href: "/admin/delivery", label: "Delivery", icon: "map" },
  { href: "/admin/riders", label: "Riders", icon: "bike" },
  { href: "/admin/coupons", label: "Coupons", icon: "ticket" },
  { href: "/admin/promotions", label: "Promotions", icon: "megaphone" },
  { href: "/admin/payments", label: "Payments", icon: "credit-card" },
  { href: "/admin/payouts", label: "Payouts", icon: "banknote" },
  { href: "/admin/reports", label: "Reports", icon: "bar-chart" },
  { href: "/admin/notifications", label: "Notifications", icon: "bell" },
  { href: "/admin/support", label: "Support", icon: "life-buoy" },
  { href: "/admin/reviews", label: "Reviews", icon: "star" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: "scroll" },
] as const;

/** SEO landing pages (static routes) */
export const seoPages = [
  { slug: "grocery-merta-city", title: "Online Grocery in Merta City", h1: "Grocery delivery in Merta City, Rajasthan", categorySlug: "grocery", intro: "Atta, dal, rice, oil, sugar and every kitchen staple from Merta City's trusted kirana stores, delivered to your door in 30–60 minutes." },
  { slug: "kirana-store-merta", title: "Kirana Stores in Merta City Online", h1: "Merta City's Kirana stores, now online", categorySlug: null, intro: "Shop from Jain Kirana Store, Shree Balaji General Store, Agarwal Super Bazaar and more — the same neighbourhood shops you trust, with home delivery." },
  { slug: "grocery-delivery-merta", title: "Grocery Home Delivery in Merta", h1: "Fast grocery home delivery in Merta", categorySlug: "grocery", intro: "Local riders deliver from nearby kirana stores across Sadar Bazaar, Station Road, Nagaur Road and Jodhpur Road. Track your rider live." },
  { slug: "masala-merta", title: "Masala & Spices Online in Merta", h1: "Asli Rajasthani masale, delivered", categorySlug: "masala-spices", intro: "Mathania mirch, Nagauri methi, MDH, Everest and chakki-fresh masale from Sharma Masala Bhandar and other Merta spice specialists." },
  { slug: "fresh-grocery-merta", title: "Fresh Fruits, Vegetables & Dairy in Merta", h1: "Farm-fresh sabzi, phal aur dairy", categorySlug: "fruits-vegetables", intro: "Fresh from Merta mandi every morning: onions, tomatoes, seasonal fruits, Saras and Amul dairy — delivered the same day." },
] as const;
