-- Fix recursive participants RLS by routing membership checks through a helper.

set check_function_bodies = off;

create or replace function public.is_room_participant(target_room_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.participants p
    where p.room_id = target_room_id
      and p.uid = auth.uid()
  );
$$;

comment on function public.is_room_participant is
  'Returns true when auth.uid() is a participant in the supplied room.';

alter function public.is_room_participant owner to postgres;

drop policy if exists "participants_select_same_room" on public.participants;
create policy "participants_select_same_room" on public.participants for select
  using (public.is_room_participant(participants.room_id));
