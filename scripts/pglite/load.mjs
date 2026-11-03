// In-memory Postgres (PGlite) harness for the SQL migrations — no local Postgres or Supabase needed.
// One-off setup (not a project dependency):  npm i --no-save @electric-sql/pglite@0.3.6
// Run:  node scripts/pglite/merge-guest.mjs

// Loads every migration into an in-memory PGlite Postgres with shims for the Supabase bits (auth, storage, extensions).
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));

export async function loadDb({ upTo = "9999" } = {}) {
  const pg = new PGlite({ extensions: { pg_trgm } });
  await pg.exec(`
    create schema if not exists extensions;
    create extension if not exists pg_trgm with schema extensions;
    create or replace function extensions.unaccent(t text) returns text language sql immutable as $$ select t $$;
    create or replace function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$
      select decode(substr(repeat(md5(random()::text), 4), 1, n * 2), 'hex') $$;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(), email text, phone text, is_anonymous boolean not null default false,
      raw_user_meta_data jsonb not null default '{}'::jsonb, last_sign_in_at timestamptz, created_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create schema if not exists storage;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  `);
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql") && f.slice(0, 4) <= upTo).sort();
  for (const f of files) {
    let sql = readFileSync(`${DIR}/${f}`, "utf8").replace(/^create extension if not exists .*$/gm, "");
    try { await pg.exec(sql); } catch (e) { throw new Error(`${f}: ${e.message}`); }
  }
  return { pg, files };
}

export async function as(pg, userId, role = "authenticated") {
  await pg.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ""}', false); select set_config('request.jwt.claim.role', '${role}', false);`);
}

export async function one(pg, sql, params = []) { const r = await pg.query(sql, params); return r.rows[0]; }
