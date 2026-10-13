"use client";
import { X } from "lucide-react";
import { useSmartBack } from "@/components/shop/app-view";

/** Minimal close control for the sign-in pages: back to the previous screen, else home. */
export function AuthClose() {
  const close = useSmartBack("/");
  return (
    <button type="button" onClick={close} aria-label="Close" className="tap absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25" style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
      <X className="h-5 w-5" />
    </button>
  );
}
