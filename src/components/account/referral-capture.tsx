"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { trackReferralAction } from "@/lib/actions/referrals";
import { toast } from "@/components/ui/toast";

const REFERRAL_KEY = "md-referral-code";

/** Keeps an invite link through sign-in, then records it against the new customer's account. */
export function ReferralCapture({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  React.useEffect(() => {
    let code: string | null = null;
    try {
      code = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase() || null;
      if (code) window.localStorage.setItem(REFERRAL_KEY, code);
      if (!signedIn) return;
      code ??= window.localStorage.getItem(REFERRAL_KEY);
    } catch {
      return;
    }
    if (!code) return;

    let current = true;
    void trackReferralAction(code).then((result) => {
      if (!current) return;
      try { window.localStorage.removeItem(REFERRAL_KEY); } catch { /* storage may be unavailable */ }
      if (result.ok) {
        toast.success("Referral link applied", "Free standard delivery is ready for your first order. Your friend earns one after it is delivered.");
        router.refresh();
      }
    });
    return () => { current = false; };
  }, [signedIn, router]);
  return null;
}
