"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { chromeFor, type Chrome } from "@/lib/page-chrome";

/**
 * One piece of the site chrome (header, footer, cart bar, bottom tabs), shown or stepped aside per
 * page type on phones/tablets (see chromeFor). Desktop keeps it. `display: contents` keeps sticky
 * and fixed children behaving exactly as if unwrapped.
 */
export function ChromePart({ part, children }: { part: keyof Chrome; children: React.ReactNode }) {
  const show = chromeFor(usePathname())[part];
  // The bottom tabs only exist below md; everything else switches below lg.
  return <div className={show ? "contents" : part === "bottomNav" ? "contents max-md:hidden" : "contents max-lg:hidden"}>{children}</div>;
}

/** Bottom padding for the docked tabs when the page has no footer to carry it (phones only). */
export function NavSpacer() {
  const c = chromeFor(usePathname());
  if (!c.bottomNav || c.footer) return null;
  return <div aria-hidden className="md:hidden" style={{ height: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 12px)" }} />;
}

/* In-app history, so Back returns to the previous screen (with its scroll position) when there is
   one, and goes to a sensible page when a link was opened directly. */
const stack: string[] = [];

/** Records client-side navigations; rendered once by the shop layout. */
export function NavHistory() {
  const pathname = usePathname();
  React.useEffect(() => {
    if (stack.length > 1 && stack[stack.length - 2] === pathname) stack.pop(); // went back
    else if (stack[stack.length - 1] !== pathname) stack.push(pathname);
  }, [pathname]);
  return null;
}

export function useSmartBack(fallback: string) {
  const router = useRouter();
  return React.useCallback(() => {
    if (stack.length > 1) router.back();
    else router.push(fallback);
  }, [router, fallback]);
}
