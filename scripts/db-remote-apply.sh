#!/usr/bin/env bash
# Applies all migrations (and optionally the seed) to a real Supabase project.
# Usage: SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres' ./scripts/db-remote-apply.sh [--seed]
# Get the connection string from Supabase → Project Settings → Database (use the session/direct connection, not transaction pooling).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the project's Postgres connection string}"
for f in supabase/migrations/*.sql; do
  echo "→ applying $f"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
if [ "${1:-}" = "--seed" ]; then
  echo "→ applying supabase/seed.sql (demo data)"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -t -o /dev/null -f supabase/seed.sql
fi
echo "✓ done. Next: fill .env.local with NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY and run pnpm dev"
