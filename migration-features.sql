-- BriloDetails: feature migration for an EXISTING Supabase project.
-- Adds gallery media, media comments, and customer suggestions.
-- Run ONCE: Dashboard > SQL Editor > New query > paste > Run.

create table if not exists media (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'image',   -- 'image' | 'video'
  url        text not null,
  caption    text default '',
  created_at timestamptz default now()
);

create table if not exists media_comments (
  id         uuid primary key default gen_random_uuid(),
  media_id   uuid references media(id) on delete cascade,
  name       text default '',
  text       text not null,
  created_at timestamptz default now()
);

create table if not exists suggestions (
  id         uuid primary key default gen_random_uuid(),
  name       text default '',
  message    text not null,
  status     text default 'new',              -- 'new' | 'reviewed'
  created_at timestamptz default now()
);

insert into media (type, url, caption)
select * from (values
  ('image','https://picsum.photos/seed/brilo-detail-1/800/500','Full Detail · Tesla Model 3'),
  ('image','https://picsum.photos/seed/brilo-detail-2/800/500','Interior Refresh · Honda CR-V'),
  ('video','https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4','Ceramic coat in action')
) as v(type, url, caption)
where not exists (select 1 from media);

alter table media          enable row level security;
alter table media_comments enable row level security;
alter table suggestions    enable row level security;

drop policy if exists "demo all" on media;
drop policy if exists "demo all" on media_comments;
drop policy if exists "demo all" on suggestions;

create policy "demo all" on media          for all using (true) with check (true);
create policy "demo all" on media_comments for all using (true) with check (true);
create policy "demo all" on suggestions    for all using (true) with check (true);

-- Enable realtime for the new tables (safe to ignore "already member" errors).
alter publication supabase_realtime add table media;
alter publication supabase_realtime add table media_comments;
alter publication supabase_realtime add table suggestions;
