"use client";
import * as React from "react";

const TEXT_INPUT = /^(text|search|tel|email|password|number|url)$/;
const isTyping = (el: Element | null) =>
  !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && TEXT_INPUT.test((el as HTMLInputElement).type)) || (el as HTMLElement).isContentEditable);

/**
 * True while a text field has focus on a touch device, i.e. the on-screen keyboard is up.
 * Floating bars (bottom nav, cart bar) hide meanwhile so they never cover the field or its submit button.
 */
export function useKeyboardOpen() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const sync = () => setOpen(isTyping(document.activeElement));
    // focusout fires before focus moves on; wait a tick so moving between fields doesn't flicker.
    const onOut = () => setTimeout(sync, 0);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", onOut);
    return () => { document.removeEventListener("focusin", sync); document.removeEventListener("focusout", onOut); };
  }, []);
  return open;
}
