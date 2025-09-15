-- -------------------------
-- ENABLE EXTENSIONS
-- -------------------------
create extension if not exists "pgcrypto";

-- -------------------------
-- USERS PROFILES
-- -------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  avatar_url text,
  created_at timestamp with time zone default now()
);
alter table profiles enable row level security;
create policy "Users can manage their own profile" on profiles
for all
using ( auth.uid() = id )
with check ( auth.uid() = id );

-- -------------------------
-- ROOMS
-- -------------------------
create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner uuid references profiles(id) on delete set null,
  created_at timestamp with time zone default now()
);
alter table rooms enable row level security;
create policy "Select rooms" on rooms
for select using (true);
create policy "Manage own rooms" on rooms
for update, delete
using (owner = auth.uid())
with check (owner = auth.uid());

-- -------------------------
-- PLAYLISTS
-- -------------------------
create table playlists (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  name text,
  created_at timestamp with time zone default now()
);
alter table playlists enable row level security;
drop policy if exists "Select playlists" on playlists;
create policy "Select playlists" on playlists
for select
using (exists (select 1 from rooms where rooms.id = playlists.room_id));

-- -------------------------
-- PLAYLIST ITEMS
-- -------------------------
create table playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid references playlists(id) on delete cascade,
  video_url text not null,
  order_index int default 0,
  created_at timestamp with time zone default now()
);
alter table playlist_items enable row level security;
drop policy if exists "Select playlist_items" on playlist_items;
create policy "Select playlist_items" on playlist_items
for select
using (exists (
  select 1
  from playlists p
  where p.id = playlist_items.playlist_id
));

-- -------------------------
-- CHAT MESSAGES
-- -------------------------
create table messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  content text not null,
  created_at timestamp with time zone default now()
);
alter table messages enable row level security;
drop policy if exists "Insert messages in room" on messages;
create policy "Insert messages in room" on messages
for insert
using (auth.uid() is not null)
with check (auth.uid() = user_id);
drop policy if exists "Select messages" on messages;
create policy "Select messages" on messages
for select
using (exists (
  select 1
  from rooms r
  where r.id = messages.room_id
));

-- -------------------------
-- HOST CONTROLS
-- -------------------------
create table controls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  action text not null,
  value jsonb,
  created_at timestamp with time zone default now()
);
alter table controls enable row level security;
drop policy if exists "Insert controls by host" on controls;
create policy "Insert controls by host" on controls
for insert
using (
  exists (
    select 1 from rooms
    where rooms.id = controls.room_id
      and rooms.owner = auth.uid()
  )
);
drop policy if exists "Select controls" on controls;
create policy "Select controls" on controls
for select
using (exists (
  select 1 from rooms r
  where r.id = controls.room_id
));

-- -------------------------
-- USER UPLOADS
-- -------------------------
create table uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  url text not null,
  created_at timestamp with time zone default now()
);
alter table uploads enable row level security;
drop policy if exists "Manage own uploads" on uploads;
create policy "Manage own uploads" on uploads
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- -------------------------
-- SEED DATA
-- -------------------------
-- Example profile
insert into profiles (id, username)
values ('11111111-1111-1111-1111-111111111111','TestUser');

-- Example room
insert into rooms (id, name, owner)
values ('22222222-2222-2222-2222-222222222222','Cinema Room 1','11111111-1111-1111-1111-111111111111');

-- Example playlist
insert into playlists (id, room_id, name)
values ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','Default Playlist');

-- Example playlist items
insert into playlist_items (playlist_id, video_url, order_index)
values
('33333333-3333-3333-3333-333333333333','https://pixeldrain.com/u/video1',0),
('33333333-3333-3333-3333-333333333333','https://pixeldrain.com/u/video2',1);

-- Example uploads
insert into uploads (user_id, url)
values ('11111111-1111-1111-1111-111111111111','https://pixeldrain.com/u/my-upload1');