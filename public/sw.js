/* Merta Deal service worker: offline page for navigations, static build assets kept for offline, web push.
   One worker serves the three installed apps (shop "/", rider "/rider", admin "/admin"). */
const VERSION = "md-v12";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";
/* The admin app's own offline page (blue, no data in it): shown when an /admin page cannot be loaded. */
const ADMIN_OFFLINE_URL = "/admin-offline.html";
/* The installed app's first screen: served from here at once, so opening the app never waits on the network. */
const START_URL = "/app-start.html";

/* Everything this worker is allowed to keep, in two lists and nothing else.
   PRECACHE: static files that are the same for every visitor and hold no data.
   isStaticAsset(): the build's own scripts, styles and fonts, and the icons.
   Never stored, whoever asks: any page (HTML), React Server Component payloads (same path as the page,
   `?_rsc=`), /api responses, /_next/image, and anything from another origin (Supabase, Razorpay, Maps).
   So no order, customer, payment or staff data is ever written to the device by this file, for the
   admin, the rider app or the shop. Nothing is queued or replayed either: a request that fails offline
   has simply failed. */
const PRECACHE = [OFFLINE_URL, ADMIN_OFFLINE_URL, START_URL, "/icon.svg", "/manifest.webmanifest", "/rider.webmanifest", "/admin.webmanifest"];
const isStaticAsset = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon.svg";
const isAdminPath = (url) => url.pathname === "/admin" || url.pathname.startsWith("/admin/") || url.pathname === ADMIN_OFFLINE_URL;

/* Fetched without cookies and stored only when it is the file itself: a redirect (to a sign-in page, say)
   or an error fails the install instead of being saved under the offline page's name. */
async function precache() {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(PRECACHE.map(async (path) => {
    const res = await fetch(path, { cache: "reload", credentials: "omit" });
    if (!res.ok || res.redirected) throw new Error(`precache ${path}: ${res.status}`);
    await cache.put(path, res);
  }));
}

/* No skipWaiting() at install: UpdatePrompt (silent) posts SKIP_WAITING once the new
   worker has installed. The page is never reloaded for an update, so unsaved work
   (a half-filled address form, a cart edit) stays; the next navigation loads the new
   version. */
self.addEventListener("install", (event) => {
  event.waitUntil(precache());
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
    // Pages are never cached (they are personal: cart, orders, prices, and in the admin every order and
    // customer). Offline, the app's own offline page is served instead of the browser's error screen:
    // the blue admin one under /admin, the shop one everywhere else.
    const offlineUrl = isAdminPath(url) ? ADMIN_OFFLINE_URL : OFFLINE_URL;
    event.respondWith(fetch(req).catch(async () => (await caches.match(offlineUrl)) || new Response("You're offline. Check your connection and try again.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
    return;
  }
  // Everything that is not a build asset or an icon goes straight to the network and is never stored:
  // /api, RSC payloads, images, data requests under /admin, /rider and the shop alike.
  if (!isStaticAsset(url)) return;
  // Network first: chunk names are not guaranteed to change with their content, so a cached copy is
  // only used when the network fails (offline). Fresh deploys therefore never run stale scripts.
  event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic" && !res.redirected) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req);
      if (hit) return hit;
      throw err;
    }
  }));
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
