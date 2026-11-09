"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginModal } from "./login-modal";

/**
 * Signed-out visitor on a private page (account, orders, checkout): the page stays in the shop frame
 * and says plainly that a login is needed, instead of bouncing to /login. The button opens the phone
 * sign-in sheet; the sign-in returns to this same page, which then renders for real.
 */
export function PleaseLogin({ title = "Please login", description = "Please login to access your account.", eta, loginTitle }: {
  title?: string; description?: string; /** "20 mins" style figure for the sign-in sheet. */ eta: string; loginTitle?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  return (
    <section className="flex min-h-[60dvh] flex-col items-center justify-center px-4 py-16 text-center sm:px-0">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-700 motion-safe:animate-pop"><UserRound className="h-7 w-7" aria-hidden /></span>
      <h1 className="font-display text-2xl font-extrabold text-ink">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-3">{description}</p>
      <Button size="lg" className="mt-7 h-13 w-full max-w-md rounded-xl text-base" onClick={() => setOpen(true)}>Login</Button>
      <p className="mt-4 text-sm text-ink-3">New to Merta Deal? <Link href={`/register?next=${encodeURIComponent(pathname)}`} className="font-semibold text-brand-700">Create account</Link></p>
      <LoginModal open={open} onClose={() => setOpen(false)} eta={eta} title={loginTitle} />
    </section>
  );
}
