/**
 * Which shared chrome each page type shows on phones and tablets (below the `lg` breakpoint).
 * Desktop always keeps the shopping header. Pages without the header render their own compact
 * top bar (AppBar / AccountSection / PageHeader) with Back, the title and relevant actions.
 */
export type Chrome = { header: boolean; bottomNav: boolean; footer: boolean; cartBar: boolean };

const under = (pathname: string, roots: string[]) => roots.some((r) => pathname === r || pathname.startsWith(`${r}/`));

export function chromeFor(pathname: string): Chrome {
  // Home: delivery location, search and cart.
  if (pathname === "/") return { header: true, bottomNav: true, footer: true, cartBar: true };
  // Purchase flow stays focused: no shopping header, tabs or footer.
  if (under(pathname, ["/cart", "/checkout"])) return { header: false, bottomNav: false, footer: false, cartBar: false };
  // Account, orders and tracking: Back + title; tabs stay for moving around.
  if (under(pathname, ["/account", "/orders", "/track"])) return { header: false, bottomNav: true, footer: false, cartBar: false };
  // Product details bring their own buy bar.
  if (under(pathname, ["/p"])) return { header: false, bottomNav: true, footer: true, cartBar: false };
  // Categories: a compact browsing screen — no marketing footer on phones.
  if (under(pathname, ["/categories"])) return { header: false, bottomNav: true, footer: false, cartBar: true };
  // Browsing: compact bar (Back, title or search, Cart).
  if (under(pathname, ["/c", "/search"])) return { header: false, bottomNav: true, footer: true, cartBar: true };
  // Information pages.
  if (under(pathname, ["/terms", "/privacy", "/about", "/delivery-area", "/attributions", "/assistant", "/start", "/deliver"])) return { header: false, bottomNav: true, footer: true, cartBar: false };
  return { header: true, bottomNav: true, footer: true, cartBar: true };
}
