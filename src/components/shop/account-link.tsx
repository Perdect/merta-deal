"use client";
import Link from "next/link";
import { User } from "lucide-react";
import { useMeStore } from "@/stores/me-store";

/** Desktop account link: "Sign in" until `/api/me` says who this is, then the first name with an unread dot. */
export function AccountLink() {
  const me = useMeStore((s) => s.me);
  const user = me?.user ?? null;
  const unread = me?.unread ?? 0;
  const label = user ? (unread > 0 ? `Account, ${unread} unread notifications` : "Account") : "Sign in";
  return (
    <Link href={user ? "/account" : "/login"} aria-label={label} className="flex h-10 items-center gap-2 rounded-full px-2.5 text-ink-2 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600">
      <User className="h-5 w-5" strokeWidth={1.75} /><span className="text-sm font-semibold">{user ? (user.fullName?.split(" ")[0] ?? "Account") : "Sign in"}</span>
      {unread > 0 ? <span aria-hidden className="h-2 w-2 rounded-full bg-saffron-500" /> : null}
    </Link>
  );
}
