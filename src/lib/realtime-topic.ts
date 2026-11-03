/**
 * Unique Realtime channel topic per subscriber. supabase-js returns the *same* channel object for the same
 * topic, and adding `postgres_changes` callbacks to a channel that is already subscribed throws
 * ("cannot add callbacks … after subscribe()"). Two components on one page watching the same rows (e.g. the
 * admin shell's notification badge and the Notifications page) must therefore never share a topic.
 */
export function realtimeTopic(base: string) {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${base}:${rand}`;
}
