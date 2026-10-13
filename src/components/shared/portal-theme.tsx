"use client";
import * as React from "react";

export type Portal = "admin" | "rider";

/**
 * Applies a portal's colour theme (.theme-admin / .theme-rider in globals.css) to <body> as well, so
 * modals, sheets and toasts that portal out of the page tree use the portal's colours too. The page
 * wrapper carries the same class for the server render, so there is no flash of customer green.
 */
export function PortalTheme({ portal }: { portal: Portal }) {
  React.useEffect(() => {
    const cls = `theme-${portal}`;
    document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [portal]);
  return null;
}
