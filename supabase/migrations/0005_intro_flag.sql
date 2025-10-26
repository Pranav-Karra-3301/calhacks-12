alter table public.rooms
  add column if not exists intro_played_at timestamptz;

