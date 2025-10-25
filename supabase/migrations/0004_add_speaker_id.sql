-- Add speaker_id column for Deepgram's speaker diarization
-- speaker_id is the speaker number from Deepgram (0, 1, 2, etc.)
-- uid is still the authenticated user who is speaking (from LiveKit participant)

alter table public.transcripts
add column if not exists speaker_id integer;

-- Create index for speaker queries
create index if not exists idx_transcripts_speaker on public.transcripts(room_id, speaker_id);

-- Add comment
comment on column public.transcripts.speaker_id is 'Deepgram speaker diarization ID (0, 1, 2, etc.)';
