-- AI Takeover Improvements Migration
-- Adds enhanced tracking for AI persona statistics and control switches

-- Add columns to rooms table for AI statistics
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ai_speaking_duration_ms INTEGER DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ai_response_count INTEGER DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ai_takeback_count INTEGER DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ai_deactivated_at TIMESTAMPTZ;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ai_deactivation_reason TEXT; -- 'manual_takeback', 'detector_guess', 'timeout', 'call_ended'

-- Create table for detailed AI session tracking
CREATE TABLE IF NOT EXISTS ai_sessions (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  response_count INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER,
  total_characters INTEGER DEFAULT 0,
  voice_id TEXT,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create table for individual AI responses
CREATE TABLE IF NOT EXISTS ai_responses (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  session_id BIGINT REFERENCES ai_sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  voice_id TEXT,
  audio_duration_ms INTEGER,
  generation_time_ms INTEGER,
  context_lines_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create table for control switches (takeback events)
CREATE TABLE IF NOT EXISTS ai_control_switches (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  uid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  switch_type TEXT NOT NULL, -- 'ai_takeover', 'manual_takeback', 'detector_guess', 'timeout'
  ai_duration_before_switch_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_ai_sessions_room ON ai_sessions(room_id);
CREATE INDEX idx_ai_responses_room ON ai_responses(room_id);
CREATE INDEX idx_ai_responses_session ON ai_responses(session_id);
CREATE INDEX idx_ai_control_switches_room ON ai_control_switches(room_id);
CREATE INDEX idx_ai_control_switches_uid ON ai_control_switches(uid);

-- Add RLS policies
ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_control_switches ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read AI data for rooms they're in
CREATE POLICY "Users can read AI sessions for their rooms"
  ON ai_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM participants
      WHERE participants.room_id = ai_sessions.room_id
      AND participants.uid = auth.uid()
    )
  );

CREATE POLICY "Users can read AI responses for their rooms"
  ON ai_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM participants
      WHERE participants.room_id = ai_responses.room_id
      AND participants.uid = auth.uid()
    )
  );

CREATE POLICY "Users can read control switches for their rooms"
  ON ai_control_switches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM participants
      WHERE participants.room_id = ai_control_switches.room_id
      AND participants.uid = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY "Service role has full access to ai_sessions"
  ON ai_sessions FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to ai_responses"
  ON ai_responses FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to ai_control_switches"
  ON ai_control_switches FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');