import { BackButton } from "@/components/shop/app-bar";

/**
 * One account section: a top bar (back arrow + title) and the page body. On phones it is the
 * sticky app bar of a full-screen page (site header and tabs are hidden on these routes).
 */
export function AccountSection({ title, back = "/account", action, children }: { title: string; back?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="max-md:min-h-[calc(100dvh-var(--bottom-nav-h))] max-md:bg-surface">
      <div className="z-20 flex items-center gap-1.5 border-b border-line bg-card px-2 py-2.5 max-lg:sticky max-lg:top-0 max-lg:border-0 max-lg:pt-[calc(0.625rem+env(safe-area-inset-top))] max-lg:shadow-[0_1px_3px_rgb(23_32_28/0.08)] md:gap-2 md:px-6 md:py-4">
        <BackButton fallback={back} />
        <h1 className="font-display text-lg font-bold text-ink md:text-xl">{title}</h1>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      <div className="p-4 pb-nav md:p-6">{children}</div>
    </div>
  );
}
