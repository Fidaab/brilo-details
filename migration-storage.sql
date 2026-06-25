-- BriloDetails: enable uploading gallery photos/videos from the device.
-- Creates a public Storage bucket and access rules so the admin (authenticated)
-- can upload, and everyone can view.
--
-- Run this whole file in: Dashboard > SQL Editor > New query > Run.

-- 1) Public bucket for gallery media -----------------------------------------
-- file_size_limit: 500 MB per file. allowed_mime_types: photos and videos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 524288000, array['image/*','video/*'])
on conflict (id) do update set
  public = true,
  file_size_limit = 524288000,
  allowed_mime_types = array['image/*','video/*'];

-- 2) Access rules on the objects in that bucket ------------------------------
-- Anyone can view (the bucket is public); only the logged-in admin can write.
drop policy if exists "gallery public read"   on storage.objects;
drop policy if exists "gallery admin insert"  on storage.objects;
drop policy if exists "gallery admin update"  on storage.objects;
drop policy if exists "gallery admin delete"  on storage.objects;

create policy "gallery public read" on storage.objects
  for select using (bucket_id = 'gallery');

create policy "gallery admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'gallery');

create policy "gallery admin update" on storage.objects
  for update to authenticated using (bucket_id = 'gallery') with check (bucket_id = 'gallery');

create policy "gallery admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'gallery');
