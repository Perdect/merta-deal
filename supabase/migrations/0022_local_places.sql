-- ============================================================================
-- MERTA DEAL — Local landmarks for address search.
-- Public map data barely covers Merta's local spots (dargahs, chowks, mohallas), so admins keep a
-- short list of landmarks with real pinned coordinates. search_local_places matches them (and the
-- delivery zones' areas) word by word with typo tolerance, so customers get instant suggestions while
-- typing — including Hinglish phrasing ("hafiz sahab ki dargah").
-- ============================================================================
create table if not exists public.local_places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  aliases text[] not null default '{}',
  area text,
  pincode text check (pincode is null or pincode ~ '^[0-9]{6}$'),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists local_places_name_trgm on public.local_places using gin (lower(name) extensions.gin_trgm_ops);

alter table public.local_places enable row level security;
drop policy if exists local_places_read on public.local_places;
create policy local_places_read on public.local_places for select using (is_active or public.is_admin());
drop policy if exists local_places_admin on public.local_places;
create policy local_places_admin on public.local_places for all using (public.is_admin()) with check (public.is_admin());

-- Word-by-word match: every meaningful query word should appear (or nearly appear) in the name,
-- aliases or area. Filler words (ki, ka, ke, near, merta, city…) are ignored.
create or replace function public.search_local_places(p_q text, p_limit int default 6)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with words as (
    select distinct w from regexp_split_to_table(lower(extensions.unaccent(coalesce(p_q, ''))), '[^a-z0-9]+') w
    where length(w) >= 2 and w not in ('ki','ka','ke','ko','se','me','mein','near','pass','the','of','to','and','merta','city','road','rd','nagaur','rajasthan','india')
  ),
  candidates as (
    select 'place' as kind, p.name, coalesce(p.area, '') as area, p.pincode, p.lat, p.lng,
           lower(extensions.unaccent(p.name || ' ' || array_to_string(p.aliases, ' ') || ' ' || coalesce(p.area, ''))) as hay
    from public.local_places p where p.is_active
    union all
    select 'area', z.area, z.name, z.pincode, z.center_lat, z.center_lng, lower(extensions.unaccent(z.area || ' ' || z.name))
    from public.delivery_zones z where z.is_active
  ),
  scored as (
    select c.*,
      (select count(*) from words w where c.hay like '%' || w.w || '%' or extensions.word_similarity(w.w, c.hay) >= 0.6) as hits,
      (select count(*) from words) as total
    from candidates c
  )
  select coalesce(jsonb_agg(jsonb_build_object('title', name, 'subtitle', trim(both ', ' from concat_ws(', ', nullif(area, ''), pincode)), 'lat', lat, 'lng', lng, 'source', kind) order by hits desc, kind, name), '[]'::jsonb)
  from (select * from scored where total > 0 and hits >= greatest(1, ceil(total * 0.6)) order by hits desc, kind limit greatest(1, least(p_limit, 10))) s;
$$;
grant execute on function public.search_local_places(text, int) to anon, authenticated;
