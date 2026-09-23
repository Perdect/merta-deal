import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo size="lg" />
      <div className="mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-ink-3"><SearchX className="h-7 w-7" /></div>
      <h1 className="mt-4 text-xl font-bold text-ink">We couldn&apos;t find that page</h1>
      <p className="mt-1 max-w-sm text-sm text-ink-3">The link may be old, or the product/store may no longer be listed.</p>
      <div className="mt-6 flex gap-2"><Button href="/">Go home</Button><Button variant="outline" href="/categories">Browse categories</Button></div>
      <p className="mt-8 text-xs text-ink-4">Looking for an order? <Link href="/track" className="font-semibold text-brand-700">Track by order number</Link></p>
    </div>
  );
}
