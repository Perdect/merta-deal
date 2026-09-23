-- ============================================================================
-- MERTA DEAL — Storage buckets & policies (skipped automatically on local PG without the storage schema)
-- ============================================================================
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not present (local shim) — skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif']),
    ('store-photos', 'store-photos', true, 5242880, array['image/jpeg','image/png','image/webp']),
    ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp']),
    ('banners', 'banners', true, 5242880, array['image/jpeg','image/png','image/webp']),
    ('store-documents', 'store-documents', false, 10485760, array['image/jpeg','image/png','application/pdf'])
  on conflict (id) do nothing;

  execute 'create policy "public read images" on storage.objects for select using (bucket_id in (''product-images'',''store-photos'',''avatars'',''banners''))';
  execute 'create policy "store members upload product images" on storage.objects for insert to authenticated with check (bucket_id = ''product-images'' and (public.is_admin() or public.is_store_member((storage.foldername(name))[1]::uuid)))';
  execute 'create policy "store members manage product images" on storage.objects for update to authenticated using (bucket_id = ''product-images'' and (public.is_admin() or public.is_store_member((storage.foldername(name))[1]::uuid)))';
  execute 'create policy "store members delete product images" on storage.objects for delete to authenticated using (bucket_id = ''product-images'' and (public.is_admin() or public.is_store_member((storage.foldername(name))[1]::uuid)))';
  execute 'create policy "store members upload store photos" on storage.objects for insert to authenticated with check (bucket_id = ''store-photos'' and (public.is_admin() or public.is_store_member((storage.foldername(name))[1]::uuid)))';
  execute 'create policy "users upload own avatar" on storage.objects for insert to authenticated with check (bucket_id = ''avatars'' and (storage.foldername(name))[1] = auth.uid()::text)';
  execute 'create policy "users update own avatar" on storage.objects for update to authenticated using (bucket_id = ''avatars'' and (storage.foldername(name))[1] = auth.uid()::text)';
  execute 'create policy "admin manage banners" on storage.objects for all to authenticated using (bucket_id = ''banners'' and public.is_admin()) with check (bucket_id = ''banners'' and public.is_admin())';
  execute 'create policy "store docs private read" on storage.objects for select to authenticated using (bucket_id = ''store-documents'' and (public.is_admin() or public.is_store_member((storage.foldername(name))[1]::uuid)))';
  execute 'create policy "store docs upload" on storage.objects for insert to authenticated with check (bucket_id = ''store-documents'' and (public.is_admin() or public.is_store_member((storage.foldername(name))[1]::uuid)))';
end $$;
