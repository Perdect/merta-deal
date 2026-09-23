import { Logo } from "@/components/ui/misc";
import { site } from "@/config/site";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <div className="bg-brand-700 px-6 pb-16 pt-8 text-white">
        <div className="mx-auto max-w-md">
          <Logo light size="lg" />
          <p className="mt-3 font-display text-lg font-bold">{site.tagline}</p>
          <p className="text-sm text-white/80">Groceries from Merta City&apos;s own kirana stores, delivered in 30–60 minutes.</p>
        </div>
      </div>
      <div className="mx-auto -mt-10 w-full max-w-md flex-1 px-4 pb-10">
        <div className="rounded-xl border border-line bg-card p-5 shadow-float sm:p-6">{children}</div>
      </div>
    </div>
  );
}
