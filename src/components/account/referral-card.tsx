"use client";
import * as React from "react";
import { Copy, Check, Share2, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { site } from "@/config/site";

/** Referral code with copy + native share (falls back to copying the message). */
export function ReferralCard({ code }: { code: string | null }) {
  const [copied, setCopied] = React.useState(false);
  if (!code) return null;
  const message = `Merta ki shopping, ab online! Order groceries from local kirana stores on Merta Deal. Use my referral code ${code} when you sign up. ${site.url}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); toast.success("Referral code copied"); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error("Could not copy", `Your code is ${code}`); }
  };
  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(message); toast.success("Invite message copied", "Paste it in WhatsApp or SMS."); }
    catch { toast.error("Sharing is not available on this device", `Your code is ${code}`); }
  };
  const share = async () => {
    if (typeof navigator.share !== "function") { await copyMessage(); return; }
    try { await navigator.share({ title: "Merta Deal", text: message, url: site.url }); }
    catch (e) { if (e instanceof Error && e.name === "AbortError") return; await copyMessage(); }
  };

  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-saffron-100 text-saffron-700"><Gift className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-ink">Your referral code</h2>
          <p className="mt-0.5 text-sm text-ink-3">Share it with friends and family in Merta. Referral bonuses, when running, appear under Coupons &amp; Offers.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-dashed border-saffron-300 bg-saffron-50 px-3.5 py-2.5">
        <code className="text-lg font-extrabold tracking-[0.2em] text-ink">{code}</code>
        <Button size="sm" variant="outline" onClick={copy} aria-label="Copy referral code">{copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}</Button>
      </div>
      <Button className="mt-3" fullWidth variant="saffron" onClick={share}><Share2 className="h-4 w-4" /> Share invite</Button>
    </section>
  );
}
