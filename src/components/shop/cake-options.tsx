"use client";
import * as React from "react";
import { Egg, PenLine, CalendarClock, ClipboardList } from "lucide-react";
import type { ProductDetail } from "@/types/app";
import { useCartStore } from "@/stores/cart-store";
import { setLineOptions } from "@/lib/cart-sync";
import { Checkbox, Input } from "@/components/ui/input";
import { CAKE_MESSAGE_MAX, cakeOffer, cleanCakeMessage } from "@/lib/cake";
import { resolveOffer } from "./product-offer";
import { formatINR } from "@/lib/utils";

/**
 * Made-to-order cake options on the product page (0049): Eggless (with the product's own extra) and a
 * message to be written on the cake. The choice is remembered for ADD and, once the line is in the
 * cart, saved to the cart line straight away (the message after a short pause while typing). Below
 * it, the admin's note ("design may differ from the photo") and three plain tiles that only state
 * what this shop actually does.
 */
export function CakeOptions({ product, note, slots }: { product: ProductDetail; note: string | null; /** Scheduled delivery slots are switched on. */ slots: boolean }) {
  const offer = React.useMemo(() => resolveOffer(product), [product]);
  const o = cakeOffer(product);
  const inventoryId = offer?.inventory_id ?? null;
  const draft = useCartStore((s) => (inventoryId ? s.draft[inventoryId] : undefined));
  const line = useCartStore((s) => (inventoryId ? s.summary?.items.find((i) => i.inventory_id === inventoryId) : undefined));
  const setDraft = useCartStore((s) => s.setDraft);
  // The store draft is the single source for the controls; a line already in the cart seeds it once.
  const message = draft?.message ?? line?.cake_message ?? "";
  const eggless = draft?.eggless ?? Boolean(line?.eggless);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // A line already in the cart (other tab, earlier visit) seeds the controls once, before any edit here.
  React.useEffect(() => {
    if (!inventoryId || draft || !line) return;
    setDraft(inventoryId, { eggless: Boolean(line.eggless), message: line.cake_message ?? "" });
  }, [inventoryId, draft, line, setDraft]);

  if (!inventoryId || (!o.eggless && !o.message)) return null;

  const toggleEggless = (v: boolean) => { void setLineOptions(inventoryId, { eggless: v, message }); };
  const typeMessage = (raw: string) => {
    const v = cleanCakeMessage(raw);
    setDraft(inventoryId, { eggless, message: v });
    if (timer.current) clearTimeout(timer.current);
    // Saved to the cart line (if it is in the cart) once typing pauses; ADD sends it along either way.
    timer.current = setTimeout(() => { void setLineOptions(inventoryId, { eggless, message: v.trim() }); }, 600);
  };

  const tiles = [
    { icon: ClipboardList, label: "Made to order", sub: "Your choices are printed on the packing slip for the baker" },
    o.message ? { icon: PenLine, label: "Message on cake", sub: `Free · up to ${CAKE_MESSAGE_MAX} characters` } : null,
    o.eggless ? { icon: Egg, label: "Eggless available", sub: o.extra > 0 ? `${formatINR(o.extra)} extra per cake` : "No extra charge" } : null,
    slots ? { icon: CalendarClock, label: "Pick a delivery slot", sub: "Choose a time at checkout" } : null,
  ].filter((t): t is { icon: typeof Egg; label: string; sub: string } => t !== null).slice(0, 3);

  return (
    <section aria-label="Cake options" className="mt-4 space-y-3">
      {o.eggless ? (
        <Checkbox checked={eggless} onChange={(e) => toggleEggless(e.target.checked)} className="text-[15px] font-semibold"
          label={<span>Eggless {o.extra > 0 ? <span className="font-medium text-ink-3">(+{formatINR(o.extra)})</span> : <span className="font-medium text-ink-3">(no extra charge)</span>}</span>} />
      ) : null}
      {o.message ? (
        <Input id="cake-message" label="Message on cake" placeholder="e.g. Happy Birthday Riya" value={message} maxLength={CAKE_MESSAGE_MAX} autoComplete="off"
          onChange={(e) => typeMessage(e.target.value)} onBlur={() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } void setLineOptions(inventoryId, { eggless, message: message.trim() }); }}
          hint={`Written on the cake exactly as typed · ${message.length}/${CAKE_MESSAGE_MAX}`} />
      ) : null}
      {note ? <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] leading-snug text-ink-2"><b className="font-bold text-ink">Note:</b> {note}</p> : null}
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-2 py-3 text-center">
            <t.icon className="h-6 w-6 text-brand-700" strokeWidth={1.5} aria-hidden />
            <span className="text-[13px] font-bold leading-tight text-ink">{t.label}</span>
            <span className="text-[11px] leading-tight text-ink-3">{t.sub}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
