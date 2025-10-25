-- Transcripts for chunked near-live Groq Whisper results
create table if not exists public.transcripts (
  id bigserial primary key,
  room_id text not null references public.rooms(id) on delete cascade,
  uid uuid references auth.users(id),
  chunk_id text,
  seq integer,
  start_ms integer,
  end_ms integer,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_transcripts_room_created on public.transcripts(room_id, created_at desc);
create index if not exists idx_transcripts_room_seq on public.transcripts(room_id, seq);

alter table public.transcripts enable row level security;

drop policy if exists "transcripts_select_participants" on public.transcripts;
create policy "transcripts_select_participants" on public.transcripts for select
  using (
    exists(
      select 1 from public.participants p
      where p.room_id = transcripts.room_id and p.uid = auth.uid()
    )
  );

drop policy if exists "transcripts_insert_self" on public.transcripts;
create policy "transcripts_insert_self" on public.transcripts for insert
  with check (
    uid = auth.uid() and
    exists(
      select 1 from public.participants p
      where p.room_id = transcripts.room_id and p.uid = auth.uid()
    )
  );

