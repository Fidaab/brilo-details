-- BriloDetails: enable uploading gallery photos/videos from the device.
-- Creates a public Storage bucket and access rules so the admin (authenticated)
-- can upload, and everyone can view.
--
-- Run this whole file in: Dashboard > SQL Editor > New query > Run.

-- 1) Public bucket for gallery media -----------------------------------------
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do update set public = true;

-- 2) Access rules on the objects in that bucket ------------------------------
-- Anyone can view (the bucket is public); only the logged-in admin can write.
drop policy if exists "gallery public read"   on storage.objects;
drop policy if exists "gallery admin insert"  on storage.objects;
drop policy if exists "gallery admin update"  on storage.objects;
drop policy if exists "gallery admin delete"  on storage.objects;

create policy "gallery public read" on storage.objects
  for select using (bucket_id = 'gallery');

create policy "gallery admin insert" on storage.objects
  for insert with check (bucket_id = 'gallery' and auth.role() = 'authenticated');

create policy "gallery admin update" on storage.objects
  for update using (bucket_id = 'gallery' and auth.role() = 'authenticated');

create policy "gallery admin delete" on storage.objects
  for delete using (bucket_id = 'gallery' and auth.role() = 'authenticated');
