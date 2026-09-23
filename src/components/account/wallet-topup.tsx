"use client";
import * as React from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/states";

/**
 * "Add money" entry point. Wallet top-up needs an online payment, so it is disabled until Razorpay is configured.
 * When configured it explains the flow instead of pretending to collect money.
 */
export function WalletTopUp({ razorpayConfigured }: { razorpayConfigured: boolean }) {
  const [open, setOpen] = React.useState(false);
  if (!razorpayConfigured) {
    return (
      <div className="space-y-2">
        <Button fullWidth disabled aria-describedby="topup-note"><Plus className="h-4 w-4" /> Add money</Button>
        <p id="topup-note" className="text-center text-xs text-ink-3">Wallet top-up will be enabled with Razorpay. Refunds and cashback are still credited here automatically.</p>
      </div>
    );
  }
  return (
    <>
      <Button fullWidth variant="secondary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add money</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="How wallet top-up works" size="sm">
        <div className="space-y-3 text-sm text-ink-2">
          <p>Top-ups use the same secure Razorpay checkout as orders (UPI, cards, net banking). Money lands in your wallet once Razorpay confirms the payment through its webhook — never before.</p>
          <Alert tone="info" icon={<ShieldCheck className="h-4 w-4" />}>Self-service top-up from this screen is not switched on yet. Your wallet is credited automatically for refunds and cashback, and you can spend the balance at checkout.</Alert>
          <Button fullWidth variant="outline" onClick={() => setOpen(false)}>Got it</Button>
        </div>
      </Modal>
    </>
  );
}
