"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/states";

/**
 * Error boundary body for a route segment. "Try again" refetches the server data (router.refresh)
 * and then re-renders the segment, so a transient failure recovers without a full reload.
 */
export function RouteError({ error, reset, title = "This page couldn't load" }: { error: Error & { digest?: string }; reset: () => void; title?: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  React.useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="py-10">
      <ErrorState
        title={title}
        description={process.env.NODE_ENV === "development" ? error.message : `Something went wrong while loading. Please try again.${error.digest ? ` (ref ${error.digest})` : ""}`}
        onRetry={() => startTransition(() => { router.refresh(); reset(); })}
      />
      {pending ? <p className="mt-2 text-center text-xs text-ink-3">Retrying…</p> : null}
    </div>
  );
}
