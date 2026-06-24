-- BriloDetails: tighten access control with role-based Row Level Security.
-- Admin  = an authenticated Supabase Auth user (the owner logs in inside the app).
-- Customer = anonymous (the public publishable key).
--
-- BEFORE running this, create your admin account:
--   Supabase Dashboard > Authentication > Users > Add user
--   -> enter your email + a password, and CHECK "Auto Confirm User".
--
-- Then run this whole file in: Dashboard > SQL Editor > New query > Run.

-- 1) Remove the permissive demo policies ----------------------------------
drop policy if exists "demo all" on packages;
drop policy if exists "demo all" on detailers;
drop policy if exists "demo all" on reservations;
drop policy if exists "demo all" on reviews;
drop policy if exists "demo all" on media;
drop policy if exists "demo all" on media_comments;
drop policy if exists "demo all" on suggestions;
drop policy if exists "demo all" on job_notes;

-- Make this script safe to re-run
drop policy if exists "read packages" on packages;
drop policy if exists "admin packages" on packages;
drop policy if exists "read detailers" on detailers;
drop policy if exists "admin detailers" on detailers;
drop policy if exists "read media" on media;
drop policy if exists "admin media" on media;
drop policy if exists "read reviews" on reviews;
drop policy if exists "create reviews" on reviews;
drop policy if exists "admin reviews" on reviews;
drop policy if exists "read comments" on media_comments;
drop policy if exists "create comments" on media_comments;
drop policy if exists "admin comments" on media_comments;
drop policy if exists "create suggestions" on suggestions;
drop policy if exists "admin suggestions" on suggestions;
drop policy if exists "read reservations" on reservations;
drop policy if exists "create reservations" on reservations;
drop policy if exists "cancel reservation" on reservations;
drop policy if exists "admin reservations" on reservations;
drop policy if exists "read job_notes" on job_notes;
drop policy if exists "create job_notes" on job_notes;
drop policy if exists "admin job_notes" on job_notes;

-- Ensure RLS is on (it already is from earlier migrations; harmless to repeat)
alter table packages       enable row level security;
alter table detailers      enable row level security;
alter table reservations   enable row level security;
alter table reviews        enable row level security;
alter table media          enable row level security;
alter table media_comments enable row level security;
alter table suggestions    enable row level security;
alter table job_notes      enable row level security;

-- 2) Packages / detailers / media: public read, admin-only write -----------
create policy "read packages"  on packages  for select using (true);
create policy "admin packages" on packages  for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "read detailers"  on detailers for select using (true);
create policy "admin detailers" on detailers for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "read media"  on media for select using (true);
create policy "admin media" on media for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 3) Reviews / comments / job_notes: public read + create, admin edit/delete
create policy "read reviews"   on reviews for select using (true);
create policy "create reviews" on reviews for insert with check (true);
create policy "admin reviews"  on reviews for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "read comments"   on media_comments for select using (true);
create policy "create comments" on media_comments for insert with check (true);
create policy "admin comments"  on media_comments for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "read job_notes"   on job_notes for select using (true);
create policy "create job_notes" on job_notes for insert with check (true);
create policy "admin job_notes"  on job_notes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 4) Suggestions: anyone can submit; only admin can read/manage -------------
create policy "create suggestions" on suggestions for insert with check (true);
create policy "admin suggestions"  on suggestions for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 5) Reservations: public read + create; customer may CANCEL own; admin all -
create policy "read reservations"   on reservations for select using (true);
create policy "create reservations" on reservations for insert with check (true);
create policy "cancel reservation"  on reservations for update
  using (true) with check (status = 'cancelled');
create policy "admin reservations"  on reservations for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
