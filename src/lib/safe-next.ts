/**
 * Post-login destinations must stay on this site. Accepts only a same-origin path ("/orders/1?x=y");
 * rejects absolute URLs, protocol-relative "//host", backslash tricks ("/\host") and control characters.
 * `within` optionally limits the path to one portal (e.g. "/admin"), excluding that portal's login page.
 * Pure (no server imports) so client components can use it too.
 */
export function safeNext(next: string | null | undefined, fallback = "/", within?: "/admin" | "/rider"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) return fallback;
  let url: URL;
  try { url = new URL(next, "https://same.invalid"); } catch { return fallback; }
  if (url.origin !== "https://same.invalid") return fallback;
  const path = url.pathname;
  if (within && !(path === within || path.startsWith(`${within}/`))) return fallback;
  if (path === "/admin/login" || path === "/rider/login") return fallback;
  return path + url.search + url.hash;
}
