"use client";
import * as React from "react";

/** Publishes the sticky header's real height as --header-h so other sticky bars sit right under it (no gap, no overlap). */
export function HeaderHeight() {
  React.useEffect(() => {
    const el = document.querySelector<HTMLElement>("header[data-site-header]");
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return null;
}
