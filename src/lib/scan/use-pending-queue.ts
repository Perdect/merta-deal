"use client";
import * as React from "react";
import type { StockInput } from "./types";

export type PendingItem =
  | { id: string; kind: "stock"; label: string; createdAt: number; input: StockInput; error?: string }
  | { id: string; kind: "pack"; label: string; createdAt: number; orderId: string; code: string; error?: string };
export type NewPending = Omit<Extract<PendingItem, { kind: "stock" }>, "createdAt" | "error"> | Omit<Extract<PendingItem, { kind: "pack" }>, "createdAt" | "error">;
/** "failed" is a refusal from the server. "offline" means no answer: the item stays and is sent again with the same key. */
export type SendOutcome = "saved" | "offline" | { failed: string };

/**
 * Changes made without a connection. Nothing here counts as saved: an item leaves the list only when
 * the server confirms it. Each one keeps its request key, so sending it again can never apply it twice.
 * Stored per staff account, so a shared phone never sends one person's changes under another's name.
 * Holds a product id or label code and a quantity; no customer details.
 */
export function usePendingQueue(userId: string, send: (item: PendingItem) => Promise<SendOutcome>) {
  const storageKey = `merta-scan-pending:${userId}`;
  const [items, setItems] = React.useState<PendingItem[]>([]);
  const [online, setOnline] = React.useState(true);
  const [flushing, setFlushing] = React.useState(false);
  const sendRef = React.useRef(send);
  React.useEffect(() => { sendRef.current = send; });
  const itemsRef = React.useRef(items);
  const busy = React.useRef(false);

  const save = React.useCallback((next: PendingItem[]) => {
    itemsRef.current = next;
    setItems(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* private mode: stays in memory */ }
  }, [storageKey]);

  const flush = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setFlushing(true);
    try {
      for (const item of itemsRef.current.filter((i) => !i.error)) {
        const outcome = await sendRef.current(item).catch((): SendOutcome => "offline");
        if (outcome === "offline") break;
        if (outcome === "saved") save(itemsRef.current.filter((i) => i.id !== item.id));
        else save(itemsRef.current.map((i) => (i.id === item.id ? { ...i, error: outcome.failed } : i)));
      }
    } finally { busy.current = false; setFlushing(false); }
  }, [save]);

  React.useEffect(() => {
    const up = () => { setOnline(true); void flush(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    // Stored items are adopted after this effect settles (a subscription-style read of localStorage), then sent if online.
    const hydrate = window.setTimeout(() => {
      let stored: PendingItem[] = [];
      try { stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as PendingItem[]; } catch { /* unreadable: start empty */ }
      itemsRef.current = stored;
      setItems(stored);
      setOnline(navigator.onLine);
      if (navigator.onLine && stored.length) void flush();
    }, 0);
    return () => { window.clearTimeout(hydrate); window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [storageKey, flush]);

  const enqueue = React.useCallback((item: NewPending) => {
    if (itemsRef.current.some((i) => i.id === item.id)) return;
    save([...itemsRef.current, { ...item, createdAt: Date.now() } as PendingItem]);
  }, [save]);
  const dismiss = React.useCallback((id: string) => save(itemsRef.current.filter((i) => i.id !== id)), [save]);

  return { items, online, flushing, enqueue, dismiss, flush };
}
