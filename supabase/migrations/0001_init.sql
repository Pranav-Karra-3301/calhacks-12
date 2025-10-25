-- Enums
create type room_status as enum ('lobby','setup','processing','talk','analysis','results','ended');
create type room_result as enum ('detector_win','target_win');
create type participant_role as enum ('target','detector');
create type clone_status as enum ('queued','processing','ready','error');
create type event_type as enum ('speech','ai-activated','ai-deactivated','guess','system');

-- Profiles (optional user metadata)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  elevenlabs_voice_id text,
  current_room_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_self_upsert" on public.profiles;
create policy "profiles_self_upsert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Rooms
create table if not exists public.rooms (
  id text primary key,
  code text unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  status room_status not null default 'lobby',
  topic text,
  target_uid uuid references auth.users(id),
  detector_uid uuid references auth.users(id),
  started_at timestamptz,
  ai_activated_at timestamptz,
  ended_at timestamptz,
  result room_result,
  max_duration_sec integer not null default 300
);

-- Participants
create table if not exists public.participants (
  room_id text not null references public.rooms(id) on delete cascade,
  uid uuid not null references auth.users(id) on delete cascade,
  display_name text,
  joined_at timestamptz not null default now(),
  role participant_role,
  is_ready boolean not null default false,
  guess_used boolean not null default false,
  guess_at timestamptz,
  guess_correct boolean,
  primary key(room_id, uid)
);

-- Now create RLS policies for rooms (after participants table exists)
alter table public.rooms enable row level security;
drop policy if exists "rooms_select_participants" on public.rooms;
create policy "rooms_select_participants" on public.rooms for select
  using (
    exists(
      select 1 from public.participants p
      where p.room_id = rooms.id and p.uid = auth.uid()
    ) or rooms.created_by = auth.uid()
  );

create index if not exists idx_participants_room_role on public.participants(room_id, role);
alter table public.participants enable row level security;
drop policy if exists "participants_select_same_room" on public.participants;
create policy "participants_select_same_room" on public.participants for select
  using (
    exists(
      select 1 from public.participants p2
      where p2.room_id = participants.room_id and p2.uid = auth.uid()
    )
  );

-- Initial voice samples
create table if not exists public.initial_samples (
  room_id text not null references public.rooms(id) on delete cascade,
  uid uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  content_type text,
  size bigint,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  transcript text,
  primary key(room_id, uid)
);

alter table public.initial_samples enable row level security;
drop policy if exists "initial_samples_select_participants" on public.initial_samples;
create policy "initial_samples_select_participants" on public.initial_samples for select
  using (
    exists(
      select 1 from public.participants p
      where p.room_id = initial_samples.room_id and p.uid = auth.uid()
    )
  );

-- Voice clones
create table if not exists public.clones (
  room_id text not null references public.rooms(id) on delete cascade,
  uid uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'elevenlabs',
  status clone_status not null default 'queued',
  voice_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  error text,
  primary key(room_id, uid)
);

create index if not exists idx_clones_room_status on public.clones(room_id, status);
alter table public.clones enable row level security;
drop policy if exists "clones_select_participants" on public.clones;
create policy "clones_select_participants" on public.clones for select
  using (
    exists(
      select 1 from public.participants p
      where p.room_id = clones.room_id and p.uid = auth.uid()
    )
  );

-- Conversation/events
create table if not exists public.events (
  id bigserial primary key,
  room_id text not null references public.rooms(id) on delete cascade,
  type event_type not null,
  uid uuid references auth.users(id),
  at timestamptz not null default now(),
  storage_path text,
  correct boolean
);

create index if not exists idx_events_room_at on public.events(room_id, at desc);
create index if not exists idx_events_room_type_at on public.events(room_id, type, at desc);
alter table public.events enable row level security;
drop policy if exists "events_select_participants" on public.events;
create policy "events_select_participants" on public.events for select
  using (
    exists(
      select 1 from public.participants p
      where p.room_id = events.room_id and p.uid = auth.uid()
    )
  );

-- Storage bucket and RLS for recordings
insert into storage.buckets (id, name, public)
  values ('recordings','recordings', false)
  on conflict (id) do nothing;

-- Storage policies
drop policy if exists "recordings_select_participants" on storage.objects;
create policy "recordings_select_participants" on storage.objects for select
  using (
    bucket_id = 'recordings' and
    exists(
      select 1 from public.participants p
      where p.uid = auth.uid() and p.room_id = split_part(name, '/', 2)
    )
  );

drop policy if exists "recordings_insert_user_scoped" on storage.objects;
create policy "recordings_insert_user_scoped" on storage.objects for insert
  with check (
    bucket_id = 'recordings' and
    split_part(name, '/', 1) = 'rooms' and
    exists(
      select 1 from public.participants p
      where p.uid = auth.uid() and p.room_id = split_part(name, '/', 2)
    ) and (
      (split_part(name, '/', 3) = 'users' and split_part(name, '/', 4) = auth.uid()::text) or
      (split_part(name, '/', 3) = 'utterances')
    )
  );

-- Do not allow update/delete for clients (service role only)
drop policy if exists "recordings_update_deny" on storage.objects;
create policy "recordings_update_deny" on storage.objects for update using (false) with check (false);
drop policy if exists "recordings_delete_deny" on storage.objects;
create policy "recordings_delete_deny" on storage.objects for delete using (false);

-- Triggers: when a recording is uploaded, create events/initial_samples
create or replace function public.handle_recordings_insert()
returns trigger as $$
declare
  room_id text;
  uid uuid;
begin
  if NEW.bucket_id <> 'recordings' then
    return NEW;
  end if;
  room_id := split_part(NEW.name, '/', 2);

  if split_part(NEW.name, '/', 3) = 'users' then
    -- Setup sample path: rooms/{room}/users/{uid}/...
    begin
      uid := split_part(NEW.name, '/', 4)::uuid;
    exception when others then
      uid := null;
    end;
    if uid is not null then
      insert into public.initial_samples (room_id, uid, storage_path, content_type, size)
      values (
        room_id,
        uid,
        NEW.name,
        coalesce(NEW.metadata->>'mimetype', null),
        coalesce((NEW.metadata->>'size')::bigint, null)
      )
      on conflict (room_id, uid) do update set
        storage_path = excluded.storage_path,
        content_type = excluded.content_type,
        size = excluded.size,
        created_at = now();
    end if;
  elsif split_part(NEW.name, '/', 3) = 'utterances' then
    -- Conversation utterance
    insert into public.events (room_id, type, uid, storage_path)
    values (
      room_id,
      'speech',
      coalesce((NEW.metadata->>'uid')::uuid, null),
      NEW.name
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_recordings_insert on storage.objects;
create trigger trg_recordings_insert
  after insert on storage.objects
  for each row execute function public.handle_recordings_insert();

