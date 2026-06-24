-- BriloDetails: per-booking private discussion thread (customer <-> admin).
-- Run ONCE in an EXISTING Supabase project: Dashboard > SQL Editor > New query > paste > Run.

create table if not exists job_notes (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid references reservations(id) on delete cascade,
  author         text not null default 'customer',  -- 'customer' | 'admin'
  name           text default '',
  text           text not null,
  created_at     timestamptz default now()
);

alter table job_notes enable row level security;
drop policy if exists "demo all" on job_notes;
create policy "demo all" on job_notes for all using (true) with check (true);

-- Enable realtime (safe to ignore an "already member" error).
alter publication supabase_realtime add table job_notes;
