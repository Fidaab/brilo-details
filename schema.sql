-- Brilo Details: Supabase schema + seed + realtime.
-- Run this ONCE in your Supabase project: Dashboard > SQL Editor > New query > paste > Run.

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists packages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  price       numeric not null default 0,
  duration    int not null default 60,
  description text default ''
);

create table if not exists detailers (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,
  phone text default ''
);

create table if not exists reservations (
  id          uuid primary key default gen_random_uuid(),
  pkg_id      uuid references packages(id) on delete set null,
  name        text,
  phone       text,
  vehicle     text,
  address     text,
  date        date,
  slot        text,
  notes       text,
  status      text default 'requested',
  detailer_id uuid references detailers(id) on delete set null,
  created_at  timestamptz default now()
);

create table if not exists reviews (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  rating     int  not null check (rating between 1 and 5),
  vehicle    text default '',
  comment    text not null,
  date       date default current_date,
  created_at timestamptz default now()
);

-- ---------- seed (only when empty) ----------
insert into packages (name, price, duration, description)
select * from (values
  ('Express Wash',     49,  45,  'Exterior hand wash, dry, and tire shine.'),
  ('Interior Refresh', 89,  90,  'Full vacuum, wipe-down, glass, and air freshener.'),
  ('Full Detail',      179, 180, 'Interior and exterior deep clean, wax, and trim restore.'),
  ('Ceramic Coat',     449, 300, 'Paint correction plus 12-month ceramic coating.')
) as v(name, price, duration, description)
where not exists (select 1 from packages);

insert into detailers (name, phone)
select * from (values ('Carlos R.','555-0123'), ('Maya T.','555-0144')) as v(name, phone)
where not exists (select 1 from detailers);

insert into reviews (name, rating, vehicle, comment, date)
select * from (values
  ('Marcus L.', 5, 'Tesla Model 3', 'Paint looks brand new. Carlos showed up on time and was incredibly thorough.', '2026-06-19'::date),
  ('Priya S.',  5, 'Honda CR-V',    'Interior refresh was amazing. Smells great and not a speck of dust left.',     '2026-06-17'::date),
  ('Dan W.',    4, 'Ford F-150',    'Great wash and the tire shine really pops. Would book again.',                 '2026-06-15'::date)
) as v(name, rating, vehicle, comment, date)
where not exists (select 1 from reviews);

-- ---------- row level security (permissive: this is a public demo) ----------
alter table packages     enable row level security;
alter table detailers    enable row level security;
alter table reservations enable row level security;
alter table reviews      enable row level security;

drop policy if exists "demo all" on packages;
drop policy if exists "demo all" on detailers;
drop policy if exists "demo all" on reservations;
drop policy if exists "demo all" on reviews;

create policy "demo all" on packages     for all using (true) with check (true);
create policy "demo all" on detailers    for all using (true) with check (true);
create policy "demo all" on reservations for all using (true) with check (true);
create policy "demo all" on reviews      for all using (true) with check (true);

-- ---------- realtime ----------
alter publication supabase_realtime add table packages, detailers, reservations, reviews;
