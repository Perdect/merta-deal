-- Local-only: PostgREST pre-request hook (no-op) + authenticator login role.
create or replace function public.local_pre_request() returns void language sql as $$ select 1; $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
