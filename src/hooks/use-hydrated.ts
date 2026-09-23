"use client";
import * as React from "react";

const subscribe = () => () => {};
/** true after hydration on the client, false during SSR — without a setState-in-effect. */
export function useHydrated() {
  return React.useSyncExternalStore(subscribe, () => true, () => false);
}
