import type { Metadata } from "next";
import { Logo } from "@/components/ui/misc";
import { site } from "@/config/site";
import { AuthClose } from "@/components/auth/auth-close";
import { LoginArt } from "@/components/auth/login-art";

/** Sign-in pages carry no search value. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Sign-in shell: one card with two panels from `sm` up (brand and illustration on the left, the form in a
 * white panel on the right); on a phone the illustration is a short banner and the form is a sheet over it.
 * The words and the picture sit in separate rows, so nothing is ever drawn over the rider.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [lead, ...rest] = site.tagline.split(", ");
  return (
    <div className="flex min-h-dvh flex-col bg-card sm:items-center sm:justify-center sm:bg-surface-2 sm:p-6">
      <div className="relative flex w-full flex-1 flex-col bg-gradient-to-br from-brand-50 via-white to-saffron-50 motion-safe:animate-rise sm:grid sm:max-w-[880px] sm:flex-none sm:grid-cols-[1fr_1.08fr] sm:gap-3 sm:overflow-hidden sm:rounded-[28px] sm:p-3 sm:shadow-float">
        <div className="flex flex-col sm:min-h-[540px]">
          <div className="px-5 pt-[calc(env(safe-area-inset-top,0px)+14px)] sm:px-5 sm:pt-6">
            <Logo size="md" />
            <p className="mt-5 hidden font-display text-[32px] font-extrabold leading-[1.12] tracking-tight text-ink sm:block">
              {lead}{rest.length ? "," : ""}<br /><span className="text-brand-700">{rest.join(", ")}</span>
            </p>
            <p className="mt-3 hidden max-w-[17rem] text-sm leading-relaxed text-ink-2 sm:block">Groceries, sweets and cakes from Merta&apos;s own shop, with a {site.deliveryWindow} delivery target.</p>
          </div>
          <div className="relative mt-1 h-40 sm:mt-4 sm:h-auto sm:flex-1"><LoginArt className="absolute inset-0 h-full w-full sm:rounded-b-[18px]" /></div>
        </div>

        <div className="relative -mt-5 flex flex-1 flex-col rounded-t-[28px] bg-card px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-7 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.18)] sm:mt-0 sm:rounded-[20px] sm:px-8 sm:pb-7 sm:pt-10 sm:shadow-card">
          <AuthClose />
          {children}
        </div>
      </div>
    </div>
  );
}
