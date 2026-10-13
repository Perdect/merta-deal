"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bot, Loader2, MessageCircle, Mic, MicOff, Send, ShoppingCart, Sparkles, User } from "lucide-react";
import type { AssistantResponse } from "@/lib/ai/schemas";
import { addToCartAction, getCartSummary } from "@/lib/actions/cart";
import { useCartStore } from "@/stores/cart-store";
import { cn, maxPerOrderMessage, onlyAvailableMessage } from "@/lib/utils";
import { packLimit } from "@/lib/cart-sync";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import { Chip } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { MatchRow, type LineChoice } from "./match-row";
import { SourceBadge } from "./source-badge";
import { planAddAll } from "./plan-add-all";
import { useSpeechInput } from "./use-speech";

type Mode = "list" | "order";
type Turn = { id: number; role: "user" | "assistant"; text: string; mode?: Mode; result?: AssistantResponse; choices?: LineChoice[]; error?: string };

const EXAMPLES: { text: string; mode: Mode }[] = [
  { text: "I need groceries for a family of 4 for one week", mode: "list" },
  { text: "Diwali sweets aur namkeen", mode: "list" },
  { text: "Bhai 2 kilo aata aur ek kilo chini bhej do", mode: "order" },
  { text: "Chai party for 10 guests on Sunday", mode: "list" },
];

let turnSeq = 1;

export function AssistantChat({ signedIn, aiConfigured, autoVoice, waId }: { signedIn: boolean; aiConfigured: boolean; autoVoice: boolean; waId: string | null }) {
  const router = useRouter();
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [mode, setMode] = React.useState<Mode>(autoVoice ? "order" : "list");
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState<number | null>(null);
  const [waBanner, setWaBanner] = React.useState<{ from: string; status: "loading" | "ok" | "error"; message?: string } | null>(waId ? { from: "", status: "loading" } : null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const modeRef = React.useRef(mode);
  React.useEffect(() => { modeRef.current = mode; }, [mode]);

  const send = React.useCallback(async (text: string, sendMode: Mode) => {
    const message = text.trim();
    if (message.length < 2 || busy) return;
    setInput("");
    setBusy(true);
    setTurns((t) => [...t, { id: turnSeq++, role: "user", text: message, mode: sendMode }]);
    try {
      const res = await fetch("/api/ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, mode: sendMode }) });
      const data = (await res.json()) as AssistantResponse | { error: string };
      if (!res.ok || "error" in data) {
        setTurns((t) => [...t, { id: turnSeq++, role: "assistant", text: "", error: "error" in data ? data.error : `Request failed (${res.status})` }]);
      } else {
        const choices = data.lines.map((l) => ({ candidate: 0, packs: l.candidates[0]?.suggested_packs ?? 1 }));
        setTurns((t) => [...t, { id: turnSeq++, role: "assistant", text: data.reply, result: data, choices }]);
      }
    } catch {
      setTurns((t) => [...t, { id: turnSeq++, role: "assistant", text: "", error: "Network error — internet check karke dobara try kijiye." }]);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const speech = useSpeechInput({ onFinal: (text) => { setInput(text); void send(text, modeRef.current); } });

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
        if (data.body) void send(data.body, "order");
      } catch {
        if (!cancelled) setWaBanner({ from: "", status: "error", message: "Could not load the WhatsApp draft." });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waId]);

  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length, busy]);

  const updateChoice = (turnId: number, lineIdx: number, choice: LineChoice) => {
    setTurns((t) => t.map((turn) => (turn.id === turnId && turn.choices ? { ...turn, choices: turn.choices.map((c, i) => (i === lineIdx ? choice : c)) } : turn)));
  };

  const addAll = async (turn: Turn) => {
    if (!turn.result || !turn.choices) return;
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent("/assistant")}`); return; }
    const cart = useCartStore.getState();
    const cartStoreId = cart.summary && !cart.summary.empty ? cart.summary.store?.id ?? null : null;
    const plan = planAddAll(turn.result.lines, turn.choices, cartStoreId);
    if (!plan.adds.length) { toast.warning("Nothing to add", plan.skipped[0]?.reason ? `Skipped: ${plan.skipped.map((s) => s.name).join(", ")}` : undefined); return; }
    setAdding(turn.id);
    let added = 0; const failed: string[] = []; const reduced: string[] = [];
    for (const a of plan.adds) {
      // Never exceed the product's per-order limit (or stock): add what fits and say what was cut.
      const c = turn.result.lines[a.lineIdx]?.candidates[a.candidateIdx];
      const lim = packLimit(c?.max_order_qty, c?.stock_qty);
      const existing = useCartStore.getState().qtyFor(a.inventoryId);
      const target = Math.min(existing + a.packs, lim.max);
      if (target < existing + a.packs) reduced.push(target <= existing ? `${a.name}: already at the limit (${(lim.byStock ? onlyAvailableMessage(lim.max) : maxPerOrderMessage(lim.max)).toLowerCase()})` : `${a.name}: ${target - existing} of ${a.packs} added (${lim.message.toLowerCase()})`);
      if (target <= existing) continue;
      const res = await addToCartAction(a.inventoryId, target);
      if (res.ok) added++;
      else failed.push(`${a.name} (${res.conflict ? "another store is in your cart" : res.error})`);
    }
    const summary = await getCartSummary();
    cart.setSummary(summary);
    setAdding(null);
    if (reduced.length) { cart.setNotice({ title: "Some quantities were reduced", lines: reduced }); cart.openDrawer("cart"); }
    if (plan.adds.some((a) => a.switched)) setTurns((t) => t.map((x) => (x.id === turn.id && x.choices ? { ...x, choices: x.choices.map((c, i) => { const sw = plan.adds.find((a) => a.lineIdx === i && a.switched); return sw ? { candidate: sw.candidateIdx, packs: sw.packs } : c; }) } : x)));
    const skippedNote = [...plan.skipped.map((s) => `${s.name} — ${s.reason}`), ...failed];
    if (added) toast.success(`Added ${added} item${added > 1 ? "s" : ""}${plan.targetStoreName ? ` from ${plan.targetStoreName}` : ""}`, skippedNote.length ? `Skipped ${skippedNote.length}: ${skippedNote.slice(0, 3).join("; ")}${skippedNote.length > 3 ? "…" : ""}` : undefined);
    else toast.error("Could not add items", skippedNote.slice(0, 3).join("; "));
  };

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); void send(input, mode); };

  return (
    <div className="flex min-h-[70vh] flex-col">
      {!aiConfigured ? (
        <Alert tone="neutral" icon={<AlertTriangle className="h-4 w-4" />} className="mb-3">
          <span className="font-semibold">Rule-based mode.</span> ANTHROPIC_API_KEY is not configured, so lists come from the Hinglish parser and fixed starter templates instead of Claude. See <Link href="/setup" className="font-semibold underline">/setup</Link>.
        </Alert>
      ) : null}
      {waBanner ? (
        <Alert tone={waBanner.status === "error" ? "warning" : "success"} icon={<MessageCircle className="h-4 w-4" />} className="mb-3">
          {waBanner.status === "loading" ? "Loading your WhatsApp order…" : waBanner.status === "ok" ? <>Prefilled from your WhatsApp message{waBanner.from ? ` (${waBanner.from})` : ""}. Review the matches below, then add to cart and checkout.</> : waBanner.message}
        </Alert>
      ) : null}

      <div className="flex-1 space-y-4">
        {turns.length === 0 ? (
          <div className="rounded-xl border border-line bg-card p-4 shadow-card sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Sparkles className="h-5 w-5" /></span>
              <div>
                <p className="font-display text-base font-bold text-ink">Batao kya chahiye — list ready ho jayegi</p>
                <p className="text-sm text-ink-3">Hinglish, Hindi ya English mein likhiye ya boliye. Har item ko Merta Deal ke asli products se match karte hain.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => <Chip key={ex.text} onClick={() => { setMode(ex.mode); void send(ex.text, ex.mode); }}>{ex.text}</Chip>)}
            </div>
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
              {turn.result ? (
                <>
                  <div className="rounded-2xl rounded-tl-sm border border-line bg-card px-4 py-3 shadow-card">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2"><SourceBadge source={turn.result.source} model={turn.result.model} fallbackReason={turn.result.fallback_reason} /><span className="text-[11px] text-ink-4">{turn.result.lines.length} item{turn.result.lines.length === 1 ? "" : "s"}</span></div>
                    <p className="text-sm text-ink">{turn.text}</p>
                  </div>
                  {turn.result.lines.length ? (
                    <>
                      <ul className="space-y-2">
                        {turn.result.lines.map((line, i) => <MatchRow key={`${turn.id}-${i}`} line={line} choice={turn.choices![i]!} onChange={(c) => updateChoice(turn.id, i, c)} signedIn={signedIn} targetStoreId={null} />)}
                      </ul>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-2/60 px-3 py-2.5">
                        <p className="text-xs text-ink-3">Each order comes from one store — “Add all” picks the store that covers the most items and skips the rest with a note.</p>
                        <Button size="sm" onClick={() => addAll(turn)} loading={adding === turn.id} disabled={adding != null}><ShoppingCart className="h-4 w-4" />{signedIn ? "Add all to cart" : "Sign in to add all"}</Button>
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        ))}

        {busy ? (
          <div className="flex gap-2">
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Bot className="h-4 w-4" /></span>
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-line bg-card px-4 py-3 text-sm text-ink-3 shadow-card"><Loader2 className="h-4 w-4 animate-spin" />{aiConfigured ? "Claude list bana raha hai aur products match kar raha hai…" : "Parsing and matching products…"}</div>
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
        <div className="mb-2 flex gap-2">
          <Chip active={mode === "list"} onClick={() => setMode("list")} className="h-8 text-xs">Plan a list</Chip>
          <Chip active={mode === "order"} onClick={() => setMode("order")} className="h-8 text-xs">Dictate an order</Chip>
        </div>
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input, mode); } }} rows={1} placeholder={mode === "order" ? "2 kg atta, 1 litre oil, Amul butter…" : "Family of 4 ke liye ek hafte ka saaman…"} aria-label="Message" className="max-h-32 min-h-11 flex-1 resize-y rounded-sm border border-line-2 bg-card px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
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
