#!/usr/bin/env node
/**
 * Catalogue performance check: server time and payload for the pages shoppers hit most.
 *   node scripts/perf-check.mjs [https://mertadeal.com] [runs=3]
 * Prints the median time-to-first-byte and total time, the compressed size, and the CDN cache state.
 * Numbers come from real requests (curl); nothing is estimated.
 */
import { execFileSync } from "node:child_process";

const base = (process.argv[2] ?? "https://mertadeal.com").replace(/\/$/, "");
const runs = Number(process.argv[3] ?? 3);
const PATHS = ["/", "/c/grocery", "/c/vegetables", "/search?q=atta", "/p/aashirvaad-shudh-chakki-atta-5-kg", "/api/search?category=grocery&page=2", "/api/search/suggest?q=amul"];

function hit(url) {
  const out = execFileSync("curl", ["-s", "-o", "/dev/null", "--compressed", "-H", "Accept: text/html,*/*", "-w", "%{time_starttransfer} %{time_total} %{size_download} %{http_code} %header{x-vercel-cache}", url], { encoding: "utf8" });
  const [ttfb, total, bytes, code, cache] = out.trim().split(/\s+/);
  return { ttfb: Number(ttfb) * 1000, total: Number(total) * 1000, bytes: Number(bytes), code, cache: cache || "-" };
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

console.log(`${base} · ${runs} runs each · medians`);
console.log("path".padEnd(44), "ttfb".padStart(8), "total".padStart(8), "gzip KB".padStart(9), "code", "cache");
for (const p of PATHS) {
  const rs = Array.from({ length: runs }, () => hit(base + p));
  const last = rs[rs.length - 1];
  console.log(p.padEnd(44), `${median(rs.map((r) => r.ttfb)).toFixed(0)}ms`.padStart(8), `${median(rs.map((r) => r.total)).toFixed(0)}ms`.padStart(8), (last.bytes / 1024).toFixed(1).padStart(9), last.code.padEnd(4), rs.map((r) => r.cache).join(","));
}
