"use client";
import { ErrorState } from "@/components/ui/states";
import { Logo } from "@/components/ui/misc";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <Logo size="lg" />
      <ErrorState title="Something went wrong" description={process.env.NODE_ENV === "development" ? error.message : "Our team has been notified. Please try again in a moment."} onRetry={reset} />
    </div>
  );
}
