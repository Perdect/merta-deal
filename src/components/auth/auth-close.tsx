"use client";
import { X } from "lucide-react";
import { useSmartBack } from "@/components/shop/app-view";

/** Close control for the sign-in pages: back to the previous screen, else home. Sits in the form panel's corner. */
export function AuthClose() {
  const close = useSmartBack("/");
  return (
    <button type="button" onClick={close} aria-label="Close" className="tap absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600">
      <X className="h-5 w-5" aria-hidden />
    </button>
  );
}
