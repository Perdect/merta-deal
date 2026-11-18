"use client";
import { RouteError } from "@/components/shared/route-error";

/** The order could not be loaded: say that, and offer the retry that refetches it. Nothing stale is shown as current. */
export default function OrderError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} title="We couldn't load this order" />;
}
