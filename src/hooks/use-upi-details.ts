"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { upiDetails, type UpiDetails } from "@/lib/upi";

let pending: Promise<UpiDetails | null> | null = null;
const load = () => (pending ??= Promise.resolve(createClient().rpc("public_settings")).then(({ data }) => upiDetails(data as Record<string, unknown> | null)).catch(() => { pending = null; return null; }));

/** Null while loading, and whenever UPI on delivery is off. */
export function useUpiDetails() {
  const [details, setDetails] = React.useState<UpiDetails | null>(null);
  React.useEffect(() => { let live = true; load().then((d) => { if (live) setDetails(d); }); return () => { live = false; }; }, []);
  return details;
}
