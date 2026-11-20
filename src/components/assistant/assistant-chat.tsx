"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bot, Loader2, MessageCircle, Mic, MicOff, RotateCcw, Send, ShoppingCart, Sparkles, User } from "lucide-react";
import type { AssistantAnswer } from "@/lib/ai/assistant-types";
import { addToCartAction, getCartSummary } from "@/lib/actions/cart";
import { ensureGuestSessionAction } from "@/lib/actions/guest";
import { useCartStore } from "@/stores/cart-store";
import { notifySessionChanged, useSignedIn } from "@/stores/me-store";
import { cn, formatINR, maxPerOrderMessage, onlyAvailableMessage } from "@/lib/utils";
import { packLimit } from "@/lib/cart-sync";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import { Chip } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { MatchRow, type LineChoice } from "./match-row";
import { SourceBadge } from "./source-badge";
import { canBuy, initialChoices, planAddSelected } from "./plan-add-all";
import { useSpeechInput } from "./use-speech";

type Mode = "list" | "order";
type Turn = { id: number; role: "user" | "assistant"; text: string; mode?: Mode; result?: AssistantAnswer; choices?: LineChoice[]; error?: string };

const EXAMPLES: { text: string; mode: Mode }[] = [
  { text: "Chai ka saaman", mode: "list" },
  { text: "Kheer banana hai", mode: "list" },
  { text: "10 logon ki party", mode: "list" },
  { text: "Bhai 2 kilo aata aur ek kilo chini bhej do", mode: "order" },
  { text: "Delivery charge kitna hai?", mode: "list" },
  { text: "Kitne baje tak order le sakte hain?", mode: "list" },
];

let turnSeq = 1;

/**
 * The shopping assistant. It proposes; the customer decides. A list arrives with every available row
 * ticked, the customer changes the ticks, products and packs, and only "Add selected to cart" changes the
 * cart, through the cart's own server action. It never checks out, orders or pays.
 */
export function AssistantChat({ signedIn, member, aiConfigured, autoVoice, waId }: { signedIn: boolean; /** Signed in with an account (not a guest session): may ask for suggestions from past orders. */ member: boolean; aiConfigured: boolean; autoVoice: boolean; waId: string | null }) {
  const router = useRouter();
  const signedInNow = useSignedIn();
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [mode, setMode] = React.useState<Mode>(autoVoice ? "order" : "list");
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState<number | null>(null);
  const [waBanner, setWaBanner] = React.useState<{ from: string; status: "loading" | "ok" | "error"; message?: string } | null>(waId ? { from: "", status: "loading" } : null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const modeRef = React.useRef(mode);
  React.useEffect(() => { modeRef.current = mode; }, [mode]);

  const ask = React.useCallback(async (shown: string, body: { message?: string; mode: Mode; action?: "reorder" }) => {
    if (busy) return;
    setBusy(true);
    setTurns((t) => [...t, { id: turnSeq++, role: "user", text: shown, mode: body.mode }]);
    try {
      const res = await fetch("/api/ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as AssistantAnswer | { error: string };
      if (!res.ok || "error" in data) {
        setTurns((t) => [...t, { id: turnSeq++, role: "assistant", text: "", error: "error" in data ? data.error : `Request failed (${res.status})` }]);
      } else {
        // A list made from a request starts ticked; "buy again" rows start unticked, since nobody asked for them yet.
        setTurns((t) => [...t, { id: turnSeq++, role: "assistant", text: data.reply, result: data, choices: initialChoices(data.lines, data.lines_from === "request") }]);
      }
    } catch {
      setTurns((t) => [...t, { id: turnSeq++, role: "assistant", text: "", error: "Network error — internet check karke dobara try kijiye." }]);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const send = React.useCallback((text: string, sendMode: Mode) => {
    const message = text.trim();
    if (message.length < 2) return;
    setInput("");
    void ask(message, { message, mode: sendMode });
  }, [ask]);

  const speech = useSpeechInput({ onFinal: (text) => { setInput(text); send(text, modeRef.current); } });

  // ?mode=voice — start listening as soon as the page is ready (browser may still ask for mic permission).
  const autoStarted = React.useRef(false);
  React.useEffect(() => {
    if (!autoVoice || autoStarted.current || speech.supported !== true) return;
    autoStarted.current = true;
    speech.start();
  }, [autoVoice, speech]);

  // ?wa=<id> — prefill from a WhatsApp message stored by the webhook.
  React.useEffect(() => {
    if (!waId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ai/whatsapp-draft?id=${encodeURIComponent(waId)}`);
        const data = (await res.json()) as { from: string; body: string; lines: unknown[] } | { error: string };
        if (cancelled) return;
        if (!res.ok || "error" in data) { setWaBanner({ from: "", status: "error", message: "error" in data ? data.error : "Could not load the WhatsApp draft." }); return; }
        setWaBanner({ from: data.from, status: "ok" });
        setMode("order");
        if (data.body) send(data.body, "order");
      } catch {
        if (!cancelled) setWaBanner({ from: "", status: "error", message: "Could not load the WhatsApp draft." });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waId]);

  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length, busy]);

  const setChoices = (turnId: number, update: (choices: LineChoice[], turn: Turn) => LineChoice[]) => {
    setTurns((t) => t.map((turn) => (turn.id === turnId && turn.choices ? { ...turn, choices: update(turn.choices, turn) } : turn)));
  };

  const addSelected = async (turn: Turn) => {
    if (!turn.result || !turn.choices || adding != null) return;
    const lines = turn.result.lines;
    const plan = planAddSelected(lines, turn.choices);
    if (!plan.adds.length) { toast.warning("Nothing selected", "Tick the items you want, then add them."); return; }
    setAdding(turn.id);
    try {
      // Same start as the shop's ADD button: a visitor gets a guest session, or is asked to sign in when guests are off.
      if (!signedIn && !signedInNow) {
        const g = await ensureGuestSessionAction();
        if (!g.ok) { toast.info("Sign in to add items", g.error); useCartStore.getState().openSheet("login"); return; }
        if (g.created) { notifySessionChanged(); router.refresh(); }
      }
      const cart = useCartStore.getState();
      const before = await getCartSummary();
      if (before) cart.setSummary(before);
      const have = (inventoryId: string) => before?.items.find((i) => i.inventory_id === inventoryId)?.quantity ?? 0;
      const added: number[] = []; const failed: string[] = []; const reduced: string[] = [];
      for (const a of plan.adds) {
        // Never exceed the product's per-order limit (or stock): add what fits and say what was cut.
        const c = lines[a.lineIdx]?.candidates[a.candidateIdx];
        const lim = packLimit(c?.max_order_qty, c?.stock_qty);
        const existing = have(a.inventoryId);
        const target = Math.min(existing + a.packs, lim.max);
        if (target < existing + a.packs) reduced.push(target <= existing ? `${a.name}: already at the limit (${(lim.byStock ? onlyAvailableMessage(lim.max) : maxPerOrderMessage(lim.max)).toLowerCase()})` : `${a.name}: ${target - existing} of ${a.packs} added (${lim.message.toLowerCase()})`);
        if (target <= existing) continue;
        const res = await addToCartAction(a.inventoryId, target);
        if (res.ok) added.push(a.lineIdx);
        else failed.push(`${a.name} (${res.error})`);
      }
      const summary = await getCartSummary();
      if (summary) cart.setSummary(summary);
      // What went in is unticked, so a second tap cannot add the same packs again by accident.
      if (added.length) setChoices(turn.id, (choices) => choices.map((c, i) => (added.includes(i) ? { ...c, selected: false } : c)));
      if (reduced.length) { cart.setNotice({ title: "Some quantities were reduced", lines: reduced }); cart.openDrawer("cart"); }
      const notes = [...plan.skipped.map((s) => `${s.name} — ${s.reason}`), ...failed];
      if (added.length) toast.success(`Added ${added.length} item${added.length > 1 ? "s" : ""} to your cart`, notes.length ? `Not added: ${notes.slice(0, 3).join("; ")}${notes.length > 3 ? "…" : ""}` : undefined);
      else if (failed.length) toast.error("Could not add items", failed.slice(0, 3).join("; "));
    } catch {
      toast.error("You seem to be offline. Check your internet connection and try again.");
    } finally {
      setAdding(null);
    }
  };

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); send(input, mode); };
  const canReorder = member;

  return (
    <div className="flex min-h-[70vh] flex-col">
      {!aiConfigured ? (
        <Alert tone="neutral" icon={<AlertTriangle className="h-4 w-4" />} className="mb-3">
          <span className="font-semibold">AI is not set up on this shop.</span> ANTHROPIC_API_KEY is not configured, so nothing here is written by AI: lists come from the built-in Hinglish word matcher and fixed starter lists, and answers about delivery, timings and payment are read straight from the shop&apos;s settings. See <Link href="/setup" className="font-semibold underline">/setup</Link>.
        </Alert>
      ) : null}
      {waBanner ? (
        <Alert tone={waBanner.status === "error" ? "warning" : "success"} icon={<MessageCircle className="h-4 w-4" />} className="mb-3">
          {waBanner.status === "loading" ? "Loading your WhatsApp order…" : waBanner.status === "ok" ? <>Prefilled from your WhatsApp message{waBanner.from ? ` (${waBanner.from})` : ""}. Review the matches below, then add what you want to your cart.</> : waBanner.message}
        </Alert>
      ) : null}

      <div className="flex-1 space-y-4">
        {turns.length === 0 ? (
          <div className="rounded-xl border border-line bg-card p-4 shadow-card sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Sparkles className="h-5 w-5" /></span>
              <div>
                <p className="font-display text-base font-bold text-ink">Batao kya chahiye — list ready ho jayegi</p>
                <p className="text-sm text-ink-3">Hinglish, Hindi ya English mein likhiye ya boliye. Har item shop ke asli products se match hota hai, aaj ke daam aur stock ke saath. Cart mein wahi jaata hai jo aap chunte hain.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => <Chip key={ex.text} onClick={() => { setMode(ex.mode); send(ex.text, ex.mode); }}>{ex.text}</Chip>)}
              {canReorder ? <Chip icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => void ask("Buy again from my past orders", { mode: "list", action: "reorder" })}>Buy again from my past orders</Chip> : null}
            </div>
            <p className="mt-3 text-xs text-ink-4">{aiConfigured ? "Suggestions are written by an AI model and can be wrong. " : ""}The assistant cannot see your orders or account; for those use <Link href="/track" className="underline">Track an order</Link> or <Link href="/account/support" className="underline">Support</Link>.</p>
          </div>
        ) : null}

        {turns.map((turn) => turn.role === "user" ? (
          <div key={turn.id} className="flex justify-end gap-2">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white shadow-card">{turn.text}</div>
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-3"><User className="h-4 w-4" /></span>
          </div>
        ) : (
          <div key={turn.id} className="flex gap-2">
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Bot className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1 space-y-3">
              {turn.error ? <Alert tone="danger">{turn.error}</Alert> : null}
              {turn.result ? <Answer turn={turn} result={turn.result} choices={turn.choices ?? []} adding={adding} onChoices={(update) => setChoices(turn.id, update)} onAdd={() => void addSelected(turn)} /> : null}
            </div>
          </div>
        ))}

        {busy ? (
          <div className="flex gap-2">
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Bot className="h-4 w-4" /></span>
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-line bg-card px-4 py-3 text-sm text-ink-3 shadow-card"><Loader2 className="h-4 w-4 animate-spin" />{aiConfigured ? "Samajh raha hoon aur shop mein dekh raha hoon…" : "Shop mein dekh raha hoon…"}</div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-[calc(var(--bottom-nav-h)_+_var(--safe-bottom)_+_8px)] z-30 mt-4 rounded-xl border border-line bg-card p-3 shadow-float md:bottom-4">
        {speech.supported === false ? (
          <p className="mb-2 flex items-start gap-1.5 text-xs text-ink-3"><MicOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />Voice input needs the Web Speech API (Chrome, Edge or Android Chrome over HTTPS). Safari and Firefox don&apos;t support it here — typing works the same.</p>
        ) : null}
        {speech.listening || speech.interim ? (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-danger opacity-75 motion-safe:animate-ping" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" /></span>
            <span className="min-w-0 flex-1 truncate">{speech.interim || "Sun raha hoon… boliye"}</span>
            <span className="text-[11px] text-brand-700">{speech.lang}</span>
          </div>
        ) : null}
        {speech.error ? <p className="mb-2 text-xs text-danger">{speech.error}</p> : null}
        <div className="mb-2 flex flex-wrap gap-2">
          <Chip active={mode === "list"} onClick={() => setMode("list")} className="h-8 text-xs">Help me shop</Chip>
          <Chip active={mode === "order"} onClick={() => setMode("order")} className="h-8 text-xs">Dictate an order</Chip>
          {canReorder && turns.length > 0 ? <Chip icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => void ask("Buy again from my past orders", { mode: "list", action: "reorder" })} className="h-8 text-xs">Buy again</Chip> : null}
        </div>
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input, mode); } }} rows={1} maxLength={1200} placeholder={mode === "order" ? "2 kg atta, 1 litre oil, Amul butter…" : "Kheer banana hai… ya delivery charge kitna hai?"} aria-label="Message" className="max-h-32 min-h-11 flex-1 resize-y rounded-sm border border-line-2 bg-card px-3.5 py-2.5 text-base text-ink sm:text-[15px] placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
          {speech.supported !== false ? (
            <button type="button" onClick={() => (speech.listening ? speech.stop() : speech.start())} disabled={speech.supported === null} aria-pressed={speech.listening} aria-label={speech.listening ? "Stop listening" : "Speak your order"} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors", speech.listening ? "border-danger bg-danger text-white" : "border-line-2 bg-card text-brand-700 hover:bg-brand-50")}>
              <Mic className="h-5 w-5" />
            </button>
          ) : null}
          <Button type="submit" size="md" disabled={busy || input.trim().length < 2} aria-label="Send"><Send className="h-4 w-4" /><span className="hidden sm:inline">Send</span></Button>
        </div>
      </form>
    </div>
  );
}

/** One answer: the reply with its source label, shop-data blocks, links to existing pages, and the list to choose from. */
function Answer({ turn, result, choices, adding, onChoices, onAdd }: { turn: Turn; result: AssistantAnswer; choices: LineChoice[]; adding: number | null; onChoices: (update: (choices: LineChoice[]) => LineChoice[]) => void; onAdd: () => void }) {
  const fromOrders = result.lines_from === "orders";
  const plan = planAddSelected(result.lines, choices);
  const total = plan.adds.reduce((sum, a) => sum + a.price * a.packs, 0);
  const buyable = result.lines.map((l, i) => canBuy(l.candidates[choices[i]?.candidate ?? 0] ?? l.candidates[0]));
  const buyableCount = buyable.filter(Boolean).length;
  const missing = result.lines.filter((l) => !l.candidates.length && !l.lookup_failed).length;
  const allTicked = buyableCount > 0 && plan.adds.length === buyableCount;
  return (
    <>
      <div className="rounded-2xl rounded-tl-sm border border-line bg-card px-4 py-3 shadow-card">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <SourceBadge source={result.source} model={result.model} fallbackReason={result.fallback_reason} />
          {fromOrders && result.source !== "orders" ? <SourceBadge source="orders" /> : null}
          {result.lines.length ? <span className="text-[11px] text-ink-4">{result.lines.length} item{result.lines.length === 1 ? "" : "s"}{missing ? ` · ${missing} not in our shop right now` : ""}</span> : null}
        </div>
        <p className="text-sm text-ink">{turn.text}</p>
        {result.needs_sign_in ? <Button href={`/login?next=${encodeURIComponent("/assistant")}`} size="sm" variant="secondary" className="mt-2.5">Sign in</Button> : null}
      </div>

      {result.facts.map((card) => (
        <section key={card.topic} className="rounded-lg border border-line bg-card px-4 py-3 shadow-card" aria-label={card.title}>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-ink">{card.title}</h3>
            <SourceBadge source="shop" />
          </div>
          <ul className="space-y-1 text-sm text-ink-2">
            {card.lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>
      ))}

      {result.links.length ? (
        <div className="flex flex-wrap gap-2">
          {result.links.map((l) => <Button key={l.href} href={l.href} size="sm" variant="outline">{l.label}</Button>)}
        </div>
      ) : null}

      {result.lines.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-3">{fromOrders ? "From your past orders, at today's prices. Tick what you want." : result.source === "claude" ? "AI suggestion — check each item, change the product or packs, untick what you don't want." : "Suggested matches — check each item, change the product or packs, untick what you don't want."}</p>
            {buyableCount > 1 ? <button type="button" onClick={() => onChoices((cs) => cs.map((c, i) => ({ ...c, selected: !allTicked && buyable[i] })))} className="tap text-xs font-semibold text-brand-700 hover:underline">{allTicked ? "Clear all" : "Select all"}</button> : null}
          </div>
          <ul className="space-y-2">
            {result.lines.map((line, i) => <MatchRow key={`${turn.id}-${i}`} line={line} choice={choices[i]!} from={result.lines_from} onChange={(c) => onChoices((cs) => cs.map((old, j) => (j === i ? c : old)))} />)}
          </ul>
          {buyableCount ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-2/60 px-3 py-2.5">
              <p className="text-xs text-ink-3">
                {plan.adds.length ? <><span className="font-semibold text-ink">{plan.adds.length} selected · {formatINR(total)}</span> at today&apos;s prices. Delivery charge and offers are worked out in the cart.</> : "Nothing is added until you tick items and tap the button."}
              </p>
              <Button size="sm" onClick={onAdd} loading={adding === turn.id} disabled={adding != null || !plan.adds.length}><ShoppingCart className="h-4 w-4" />Add selected to cart</Button>
            </div>
          ) : <p className="rounded-md border border-line bg-surface-2/60 px-3 py-2.5 text-xs text-ink-3">None of these can be added right now.</p>}
        </>
      ) : null}
    </>
  );
}
