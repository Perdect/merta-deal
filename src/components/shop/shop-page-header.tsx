import { PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { AppBar } from "./app-bar";

/**
 * Page title for shop pages: the compact AppBar (Back · title · actions · Cart) on phones and
 * tablets, the regular PageHeader on desktop — never both, so the title isn't repeated.
 */
export function ShopPageHeader({ title, barTitle, subtitle, back, fallback = back ?? "/", cart, actions, className, barClassName, keepTitle }: {
  title: string; barTitle?: string; subtitle?: React.ReactNode; back?: string; fallback?: string; cart?: boolean; actions?: React.ReactNode; className?: string; barClassName?: string;
  /** Keep the page heading visible under the bar on phones (e.g. a longer SEO heading than the bar title). */ keepTitle?: boolean;
}) {
  return (
    <>
      <AppBar title={barTitle ?? title} subtitle={typeof subtitle === "string" && !barTitle ? subtitle : undefined} back={fallback} cart={cart} actions={actions} className={barClassName} />
      <PageHeader title={title} subtitle={subtitle} back={back} className={cn(!keepTitle && "max-lg:hidden", className)} />
    </>
  );
}
