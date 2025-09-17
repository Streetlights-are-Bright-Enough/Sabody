-- Create rooms table
create table if not exists rooms (
    id bigserial primary key,
    name text not null,
    active_users int default 0,
    created_at timestamp with time zone default now()
);

-- Create messages table
create table if not exists messages (
    id bigserial primary key,
    room_id bigint references rooms(id) on delete cascade,
    user text not null,
    content text not null,
    system boolean default false,
    created_at timestamp with time zone default now()
);

-- Enable realtime for rooms and messages
alter table rooms enable row level security;
alter table messages enable row level security;

-- Minimal policy to allow insert/select for anon
create policy "allow anon select" on rooms for select using (true);
create policy "allow anon insert" on rooms for insert with check (true);
create policy "allow anon select" on messages for select using (true);
create policy "allow anon insert" on messages for insert with check (true);