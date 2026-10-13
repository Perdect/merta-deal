import { safeNext } from "@/lib/safe-next";

/** Where "Back" / "Cancel" from a product form returns: the products list exactly as it was (search, filters, page). */
export function productsBackHref(back: string | undefined | null) {
  const to = safeNext(back, "/store/products");
  return to === "/store/products" || to.startsWith("/store/products?") ? to : "/store/products";
}
