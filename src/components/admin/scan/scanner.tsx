"use client";
import * as React from "react";
import { Camera, CameraOff, Flashlight, FlashlightOff, Keyboard, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScanner, type ScannerStatus } from "@/lib/scan/use-scanner";
import { cn } from "@/lib/utils";

const STATUS_COPY: Record<ScannerStatus, string | null> = {
  idle: null, starting: "Starting the camera…", running: null,
  denied: "Camera access is blocked. Allow the camera for this site in your browser settings, or type the code below.",
  unavailable: "No camera was found on this device. Type the code below.",
  error: "The camera could not start. Try switching cameras, or type the code below.",
};

/**
 * Live camera view that reads QR codes and retail barcodes, with camera switching, torch where the
 * device offers it, and a large manual entry field for when the camera is unavailable. Scanning only
 * reports a code; nothing changes until the staff member confirms an action.
 */
export function Scanner({ active, onCode, hint, manualLabel = "Or type the SKU, barcode or order number", className, children }: {
  active: boolean; onCode: (code: string) => void; hint?: React.ReactNode; manualLabel?: string; className?: string; /** Rendered over the viewfinder's bottom edge (last result, counts). */ children?: React.ReactNode;
}) {
  const { videoRef, status, canSwitch, switchCamera, torchSupported, torchOn, toggleTorch } = useScanner(active, onCode);
  const [manual, setManual] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const submit = (e: React.FormEvent) => { e.preventDefault(); const v = manual.trim(); if (!v) return; onCode(v); setManual(""); };
  const message = STATUS_COPY[status];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative aspect-[4/3] max-h-[42dvh] w-full overflow-hidden rounded-2xl bg-ink">
        {/* The video keeps rendering while inactive so the frame does not jump; the stream is simply stopped. */}
        <video ref={videoRef} playsInline muted autoPlay className={cn("h-full w-full object-cover", status !== "running" && "opacity-0")} aria-label="Camera view" />
        {status === "running" ? (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[58%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.28)]" />
            <div className="absolute inset-x-[16%] top-1/2 h-0.5 bg-brand-400/90 motion-safe:animate-[scan-sweep_2.2s_ease-in-out_infinite]" />
          </div>
        ) : null}
        {!active ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white/90">
            <CameraOff className="h-8 w-8" aria-hidden />
            <p className="text-sm font-semibold">Camera paused</p>
          </div>
        ) : message ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white/90" role="status">
            {status === "starting" ? <Camera className="h-8 w-8 motion-safe:animate-pulse" aria-hidden /> : <CameraOff className="h-8 w-8" aria-hidden />}
            <p className="text-sm font-medium">{message}</p>
          </div>
        ) : null}
        {active && status === "running" ? (
          <div className="absolute right-2 top-2 flex gap-1.5">
            {canSwitch ? <button type="button" onClick={switchCamera} aria-label="Switch camera" className="tap flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white"><SwitchCamera className="h-5 w-5" /></button> : null}
            {torchSupported ? <button type="button" onClick={toggleTorch} aria-pressed={torchOn} aria-label={torchOn ? "Turn torch off" : "Turn torch on"} className={cn("tap flex h-11 w-11 items-center justify-center rounded-full text-white backdrop-blur focus-visible:outline-2 focus-visible:outline-white", torchOn ? "bg-saffron-500" : "bg-black/55 hover:bg-black/70")}>{torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}</button> : null}
          </div>
        ) : null}
        {children ? <div className="absolute inset-x-0 bottom-0">{children}</div> : null}
      </div>
      {hint ? <p className="text-center text-xs text-ink-3">{hint}</p> : null}

      <form onSubmit={submit} className="flex gap-2">
        <label className="sr-only" htmlFor="scan-manual">{manualLabel}</label>
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-4" aria-hidden />
          <input id="scan-manual" ref={inputRef} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={manualLabel} autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="go"
            className="h-12 w-full rounded-xl border border-line-2 bg-card pl-10 pr-3 font-mono text-base uppercase text-ink placeholder:font-sans placeholder:normal-case placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
        </div>
        <Button type="submit" size="lg" variant="secondary" disabled={!manual.trim()} className="h-12 px-4">Go</Button>
      </form>
    </div>
  );
}

/** One-line status under the viewfinder: colour tells the result before the words are read. */
export function ScanBanner({ tone, title, detail, className }: { tone: "ok" | "bad" | "warn" | "info"; title: string; detail?: string | null; className?: string }) {
  const cls = { ok: "bg-success text-white", bad: "bg-danger text-white", warn: "bg-saffron-500 text-ink", info: "bg-ink/85 text-white" }[tone];
  return (
    <div role="status" aria-live="polite" className={cn("px-3 py-2.5 text-sm font-semibold backdrop-blur", cls, className)}>
      <p className="leading-snug">{title}</p>
      {detail ? <p className="text-xs font-medium opacity-90">{detail}</p> : null}
    </div>
  );
}
