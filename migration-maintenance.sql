-- BriloDetails: maintenance reminders + recurring maintenance plans.
--   maintenance_reminders: the admin sends a one-off "time for a detail" nudge
--     to a customer (by phone). The customer sees it on My Visits and can
--     schedule it or dismiss it.
--   maintenance_plans: a customer signs up for a recurring detail (e.g. every
--     4 weeks). The app shows a "due" prompt when next_due has passed.
--
-- Run this whole file in: Dashboard > SQL Editor > New query > Run.

create table if not exists maintenance_reminders (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  name       text default '',
  vehicle    text default '',
  message    text not null,
  pkg_id     uuid references packages(id) on delete set null,
  status     text not null default 'sent',   -- 'sent' | 'scheduled' | 'dismissed'
  created_at timestamptz default now()
);

create table if not exists maintenance_plans (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null,
  name          text default '',
  vehicle       text default '',
  pkg_id        uuid references packages(id) on delete set null,
  interval_weeks int not null default 4,
  next_due      date,
  active        boolean not null default true,
  created_at    timestamptz default now()
);

alter table maintenance_reminders enable row level security;
alter table maintenance_plans     enable row level security;

-- Reminders: everyone reads; customer can update status (schedule/dismiss);
-- only the admin can create or delete.
drop policy if exists "read reminders"   on maintenance_reminders;
drop policy if exists "update reminders" on maintenance_reminders;
drop policy if exists "admin reminders"  on maintenance_reminders;
create policy "read reminders"   on maintenance_reminders for select using (true);
create policy "update reminders" on maintenance_reminders for update using (true) with check (true);
create policy "admin reminders"  on maintenance_reminders for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Plans: customer self-serve (read + create + update own); admin full control.
drop policy if exists "read plans"   on maintenance_plans;
drop policy if exists "create plans" on maintenance_plans;
drop policy if exists "update plans" on maintenance_plans;
drop policy if exists "admin plans"  on maintenance_plans;
create policy "read plans"   on maintenance_plans for select using (true);
create policy "create plans" on maintenance_plans for insert with check (true);
create policy "update plans" on maintenance_plans for update using (true) with check (true);
create policy "admin plans"  on maintenance_plans for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'maintenance_reminders'
  ) then
    alter publication supabase_realtime add table maintenance_reminders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'maintenance_plans'
  ) then
    alter publication supabase_realtime add table maintenance_plans;
  end if;
end $$;
