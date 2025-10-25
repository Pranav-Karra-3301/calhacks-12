-- Add avatar fields to profiles table
alter table public.profiles
  add column if not exists avatar_seed text,
  add column if not exists avatar_options jsonb default '{}'::jsonb;

