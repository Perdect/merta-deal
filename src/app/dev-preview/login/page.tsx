import { notFound } from "next/navigation";
import AuthLayout from "@/app/(auth)/layout";
import { LoginForm } from "@/components/auth/login-form";

/** Development only: the sign-in screen on its code step (`?state=otp`), which cannot be reached without a real SMS. */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  return (
    <AuthLayout>
      <LoginForm phoneEnabled={state !== "off"} initial={state === "otp" ? { mobile: "9876543210", step: "otp" } : undefined} />
    </AuthLayout>
  );
}
