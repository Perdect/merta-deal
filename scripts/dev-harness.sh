#!/usr/bin/env bash
# LOCAL DEV HARNESS (no Supabase project needed): PostgREST + Supabase Auth (GoTrue) + a gateway that mimics
# the Supabase URL layout, all against the local Postgres copy. Realtime and Storage are NOT emulated —
# the app falls back to polling and shows honest upload errors. Never use this in production.
#   ./scripts/dev-harness.sh start | stop | restart
set -euo pipefail
cd "$(dirname "$0")/.."
LOG_DIR="${TMPDIR:-/tmp}/merta-harness"; mkdir -p "$LOG_DIR"
stop() {
  pkill -f "postgrest supabase/local/postgrest.conf" 2>/dev/null || true
  pkill -f "supabase/local/gateway.mjs" 2>/dev/null || true
  pkill -f "supabase/local/bin/auth" 2>/dev/null || true
  pkill -f "bin/auth serve" 2>/dev/null || true
}
start() {
  command -v postgrest >/dev/null || { echo "Install PostgREST first: brew install postgrest"; exit 1; }
  if [ ! -x supabase/local/bin/auth ]; then
    echo "Downloading Supabase Auth (GoTrue) v2.197.0 for macOS arm64…"
    mkdir -p supabase/local/bin && curl -sSL -o /tmp/auth.tgz "https://github.com/supabase/auth/releases/download/v2.197.0/auth-v2.197.0-darwin-arm64.tar.gz" && tar -xzf /tmp/auth.tgz -C supabase/local/bin && rm /tmp/auth.tgz
  fi
  psql -h /tmp -d merta_deal -Atc "select 1 from auth.schema_migrations limit 1" >/dev/null 2>&1 || ./scripts/db-local-reset.sh
  stop
  nohup postgrest supabase/local/postgrest.conf > "$LOG_DIR/postgrest.log" 2>&1 &
  (cd supabase/local/bin && set -a && . ../gotrue.env && set +a && nohup ./auth serve > "$LOG_DIR/gotrue.log" 2>&1 &)
  nohup node supabase/local/gateway.mjs > "$LOG_DIR/gateway.log" 2>&1 &
  sleep 3
  KEY=$(grep '^ANON_KEY=' "$LOG_DIR/gateway.log" | head -1 | cut -d= -f2)
  SRK=$(grep '^SERVICE_ROLE_KEY=' "$LOG_DIR/gateway.log" | head -1 | cut -d= -f2)
  if [ ! -f .env.local ] || grep -q "LOCAL DEV HARNESS" .env.local; then
    :
    printf "# LOCAL DEV HARNESS — replace with real Supabase values to go live\nNEXT_PUBLIC_SUPABASE_URL=http://localhost:54321\nNEXT_PUBLIC_SUPABASE_ANON_KEY=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\nNEXT_PUBLIC_SITE_URL=http://localhost:3000\nNEXT_PUBLIC_ANONYMOUS_AUTH_ENABLED=true\n" "$KEY" "$SRK" > .env.local
    echo "wrote .env.local (harness values)"
  fi
  curl -sf http://127.0.0.1:54323/health >/dev/null && echo "auth: up" || echo "auth: NOT up (see $LOG_DIR/gotrue.log)"
  curl -sf http://127.0.0.1:54322/ -H "Accept: application/openapi+json" | grep -q "\"openapi\"" && echo "rest: up" || echo "rest: NOT up (see $LOG_DIR/postgrest.log)"
  echo "harness up: gateway http://localhost:54321 (logs in $LOG_DIR). Now run: pnpm dev"
}
case "${1:-start}" in start) start ;; stop) stop; echo "harness stopped" ;; restart) stop; start ;; esac
