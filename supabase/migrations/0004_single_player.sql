-- Single player game statistics
CREATE TABLE IF NOT EXISTS single_player_stats (
  id BIGSERIAL PRIMARY KEY,
  uid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_ai BOOLEAN NOT NULL,
  guessed_ai BOOLEAN NOT NULL,
  correct BOOLEAN NOT NULL,
  audio_file TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sp_stats_uid ON single_player_stats(uid);
CREATE INDEX idx_sp_stats_created ON single_player_stats(created_at DESC);

