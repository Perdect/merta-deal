#!/usr/bin/env bash
# Rebuilds the LOCAL validation database (Postgres on this machine) from migrations + seed.
# Uses the real Supabase Auth (GoTrue) schema when supabase/local/bin/auth exists (see scripts/dev-harness.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${LOCAL_DB_NAME:-merta_deal}"
HOST="${LOCAL_DB_HOST:-/tmp}"
psql -h "$HOST" -d postgres -qc "drop database if exists $DB;" >/dev/null
psql -h "$HOST" -d postgres -qc "create database $DB;" >/dev/null
psql -h "$HOST" -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/local/00_supabase_shim.sql
if [ -x supabase/local/bin/auth ]; then
  (cd supabase/local/bin && set -a && . ../gotrue.env && set +a && ./auth migrate >/dev/null 2>&1) && echo "auth schema: GoTrue migrations"
  psql -h "$HOST" -d "$DB" -qc "grant usage on schema auth to anon, authenticated, service_role; grant select on auth.users to service_role;" >/dev/null
else
  psql -h "$HOST" -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/local/00b_auth_tables_fallback.sql && echo "auth schema: minimal fallback"
fi
for f in supabase/migrations/*.sql; do
  psql -h "$HOST" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -v -E 'NOTICE|WARNING|HINT' || true
done
if [ "${SKIP_SEED:-0}" != "1" ]; then
  psql -h "$HOST" -d "$DB" -v ON_ERROR_STOP=1 -q -t -o /dev/null -f supabase/seed.sql
fi
psql -h "$HOST" -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/local/01_postgrest_prereq.sql 2>/dev/null || true
echo "local db '$DB' ready"
