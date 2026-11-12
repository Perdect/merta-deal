/* Merta Deal service worker: offline shell for navigations, cache-first static assets, web push. */
const VERSION = "md-v10";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";
/* The installed app's first screen: served from here at once, so opening the app never waits on the network. */
const START_URL = "/app-start.html";

/* No skipWaiting() at install: UpdatePrompt (silent) posts SKIP_WAITING once the new
   worker has installed. The page is never reloaded for an update, so unsaved work
   (a half-filled address form, a cart edit) stays; the next navigation loads the new
   version. */
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll([OFFLINE_URL, START_URL, "/icon.svg", "/manifest.webmanifest", "/rider.webmanifest"])));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch Supabase / Razorpay / Maps
  if (req.mode === "navigate" && url.pathname === START_URL) {
    event.respondWith(caches.match(START_URL).then((hit) => hit || fetch(req)));
    return;
  }
  if (req.mode === "navigate") {
    // Pages are never cached (they are personal: cart, orders, prices). Offline, the branded
    // offline page is served instead of the browser's error screen.
    event.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) || new Response("You're offline. Check your connection and try again.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon.svg") {
    // Network first: chunk names are not guaranteed to change with their content, so a cached copy is
    // only used when the network fails (offline). Fresh deploys therefore never run stale scripts.
    event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw err;
      }
    }));
  }
});

/* Alerts (a new order for staff, a delivery request for a rider) stay on screen until dismissed and buzz
   longer; one notification per order so retries replace rather than pile up. Bodies never carry a
   customer's name, phone or address. A closed browser or a locked phone shows them only as long as the
   platform delivers push at all: there is no continuous ringing without a native app. */
const ALERT_TYPES = ["new_order", "delivery_offer", "order_unattended", "dispatch_no_rider", "order_exception", "delivery_cancelled"];
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Merta Deal", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Merta Deal";
  const inner = data.data || {};
  const alert = ALERT_TYPES.includes(data.type);
  const tag = data.tag || (inner.order_id ? `${data.type || "n"}-${inner.order_id}` : undefined);
  const options = {
    body: data.body || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
    data: { url: data.url || "/", type: data.type || "" }, tag, renotify: Boolean(tag),
    requireInteraction: alert, vibrate: alert ? [300, 120, 300, 120, 300] : [80, 40, 80],
    actions: alert ? [{ action: "open", title: data.type === "delivery_offer" ? "Open request" : "View order" }] : [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  // Prefer a window already in the same app (admin / rider / shop) so an open dashboard is reused.
  const area = url.startsWith("/admin") ? "/admin" : url.startsWith("/rider") ? "/rider" : "";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const same = list.find((c) => area && new URL(c.url).pathname.startsWith(area)) || list[0];
    if (same && "focus" in same) { same.navigate(url); return same.focus(); }
    return self.clients.openWindow(url);
  }));
});
