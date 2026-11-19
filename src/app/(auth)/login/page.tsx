import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; confirmed?: string }> }) {
  const sp = await searchParams;
  return <LoginForm next={sp.next} phoneEnabled={env.phoneAuthEnabled} confirmed={sp.confirmed === "1"} />;
}
