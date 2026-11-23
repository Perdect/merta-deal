import type { Metadata } from "next";
import { Logo } from "@/components/ui/misc";
import { site } from "@/config/site";
import { AuthClose } from "@/components/auth/auth-close";
import { LoginArt } from "@/components/auth/login-art";
import { AuthHero } from "@/components/auth/auth-hero";

/** Sign-in pages carry no search value. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Sign-in shell: one card with two panels from `sm` up (brand and illustration on the left, the form in a
 * white panel on the right). On a phone the illustration is a block across the top with the logo and Skip
 * in its corners, and the form follows straight under it; `AuthHero` shrinks the block when the keyboard
 * opens so the number field and Continue never need scrolling.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [lead, ...rest] = site.tagline.split(", ");
  return (
    <div className="flex min-h-dvh flex-col bg-card sm:items-center sm:justify-center sm:bg-surface-2 sm:p-6">
      <div className="relative flex w-full flex-1 flex-col bg-card motion-safe:animate-rise sm:grid sm:max-w-[880px] sm:flex-none sm:grid-cols-[1fr_1.08fr] sm:gap-3 sm:overflow-hidden sm:rounded-[28px] sm:bg-gradient-to-br sm:from-brand-50 sm:via-white sm:to-saffron-50 sm:p-3 sm:shadow-float">
        <AuthHero bar={<>
          <span className="rounded-2xl bg-card/90 px-2.5 py-1.5 shadow-card sm:rounded-none sm:bg-transparent sm:p-0 sm:shadow-none"><Logo size="sm" className="sm:hidden" /><Logo size="md" className="hidden sm:inline-flex" /></span>
          <AuthClose skip />
          <p className="mt-5 hidden font-display text-[32px] font-extrabold leading-[1.12] tracking-tight text-ink sm:block">
            {lead}{rest.length ? "," : ""}<br /><span className="text-brand-700">{rest.join(", ")}</span>
          </p>
          <p className="mt-3 hidden max-w-[17rem] text-sm leading-relaxed text-ink-2 sm:block">Groceries, sweets and cakes from Merta&apos;s own shop, with a {site.deliveryWindow} delivery target.</p>
        </>}>
          <LoginArt className="absolute inset-0 h-full w-full sm:rounded-b-[18px]" />
        </AuthHero>

        <div data-auth-sheet className="relative flex flex-1 flex-col bg-card px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-6 sm:rounded-[20px] sm:px-8 sm:pb-7 sm:pt-10 sm:shadow-card">
          <AuthClose />
          {children}
        </div>
      </div>
    </div>
  );
}
