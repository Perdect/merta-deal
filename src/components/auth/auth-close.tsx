"use client";
import { X } from "lucide-react";
import { useSmartBack } from "@/components/shop/app-view";

/**
 * Leaves the sign-in pages: back to the previous screen, else home. From `sm` up it is the X in the form
 * panel's corner; on a phone (`skip`) it is the Skip button on the picture, since browsing needs no account.
 */
export function AuthClose({ skip }: { skip?: boolean }) {
  const close = useSmartBack("/");
  if (skip) return <button type="button" onClick={close} className="tap flex h-11 items-center rounded-2xl bg-card px-4 text-sm font-bold text-brand-700 shadow-card focus-visible:outline-2 focus-visible:outline-brand-600 sm:hidden">Skip</button>;
  return (
    <button type="button" onClick={close} aria-label="Close" className="tap absolute right-3 top-3 z-10 hidden h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600 sm:flex">
      <X className="h-5 w-5" aria-hidden />
    </button>
  );
}
