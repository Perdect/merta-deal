// HTTP smoke test against a running app (pnpm dev or pnpm start). Usage: BASE=http://localhost:3000 node scripts/smoke.mjs
const BASE = process.env.BASE ?? "http://localhost:3000";
const checks = [
  ["/", 200], ["/categories", 200], ["/c/grocery", 200], ["/c/atta", 200], ["/search?q=aata", 200], ["/stores", 200], ["/s/jain-kirana-store", 200],
  ["/p/aashirvaad-shudh-chakki-atta-5-kg", 200], ["/track", 200], ["/login", 200], ["/register", 200], ["/start", 200],
  ["/grocery-merta-city", 200], ["/kirana-store-merta", 200], ["/grocery-delivery-merta", 200], ["/masala-merta", 200], ["/fresh-grocery-merta", 200],
  ["/sitemap.xml", 200], ["/robots.txt", 200], ["/manifest.webmanifest", 200], ["/sw.js", 200], ["/offline.html", 200],
  ["/api/search/suggest?q=amul", 200], ["/api/location/serviceability?pincode=341510", 200], ["/api/qr?path=/start", 200],
  ["/cart", 200], ["/orders", 302], ["/checkout", 302], ["/admin", 302], ["/store", 302], ["/rider", 302], ["/does-not-exist", 404],
];
let fail = 0;
for (const [path, expected] of checks) {
  try {
    const r = await fetch(BASE + path, { redirect: "manual" });
    const ok = r.status === expected || (expected === 302 && [302, 307, 308].includes(r.status));
    console.log(`${ok ? "ok " : "FAIL"} ${r.status} ${path}`);
    if (!ok) fail++;
  } catch (e) { console.log(`FAIL ERR ${path} ${e.message}`); fail++; }
}
console.log(fail ? `\n${fail} failures` : "\nall smoke checks passed");
process.exit(fail ? 1 : 0);
