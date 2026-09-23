// LOCAL DEV HARNESS ONLY: tiny gateway that mimics the Supabase URL layout.
//   /rest/v1/*  -> PostgREST (:3101)      /auth/v1/* -> GoTrue (:9999)
//   /realtime, /storage -> 501 with an honest message (needs a real Supabase project).
import http from "node:http";
import crypto from "node:crypto";
const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const REST = process.env.POSTGREST_URL ?? "http://127.0.0.1:54322";
const AUTH = process.env.GOTRUE_URL ?? "http://127.0.0.1:54323";

function proxy(req, res, base, prefix) {
  const target = new URL((req.url ?? "/").replace(prefix, "") || "/", base);
  const headers = { ...req.headers, host: target.host };
  const p = http.request(target, { method: req.method, headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
  p.on("error", (e) => { res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ message: `${prefix} upstream unavailable: ${e.message}` })); });
  req.pipe(p);
}
const server = http.createServer((req, res) => {
  const url = req.url ?? "/";
  if (url.startsWith("/rest/v1")) return proxy(req, res, REST, "/rest/v1");
  if (url.startsWith("/auth/v1")) return proxy(req, res, AUTH, "/auth/v1");
  res.writeHead(501, { "content-type": "application/json" });
  res.end(JSON.stringify({ message: "Local dev harness: /rest/v1 and /auth/v1 are served. Realtime and Storage need a real Supabase project." }));
});
server.listen(PORT, "127.0.0.1", () => console.log(`gateway on http://localhost:${PORT} -> rest ${REST}, auth ${AUTH}`));

// anon + service-role JWTs (HS256 with the shared local secret)
const secret = "merta-deal-local-dev-secret-at-least-32-chars!!";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (payload) => { const unsigned = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`; return `${unsigned}.${crypto.createHmac("sha256", secret).update(unsigned).digest("base64url")}`; };
console.log("ANON_KEY=" + sign({ role: "anon", iss: "supabase-local", iat: 1700000000, exp: 4102444800 }));
console.log("SERVICE_ROLE_KEY=" + sign({ role: "service_role", iss: "supabase-local", iat: 1700000000, exp: 4102444800 }));
