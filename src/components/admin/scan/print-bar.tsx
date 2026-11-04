"use client";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Sticky bar above a printable sheet. Hidden on paper. */
export function PrintBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="print-hide sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-2">
        <button type="button" onClick={() => (history.length > 1 ? history.back() : window.close())} className="tap inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-ink-2 hover:bg-surface-2"><ArrowLeft className="h-4 w-4" aria-hidden />Back</button>
        <div className="min-w-0 flex-1">{children}</div>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>
      </div>
    </div>
  );
}
