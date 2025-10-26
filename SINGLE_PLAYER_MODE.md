# Single Player Mode - Implementation Guide

## Overview

The single player mode provides a backup game experience where users can practice AI detection by listening to audio samples and guessing whether they're AI-generated or human speech.

## Features

- **Swipe-based gameplay**: Swipe left for human, right for AI (works on both mobile and desktop)
- **Keyboard shortcuts**: Use arrow keys (← / →) on desktop
- **Session tracking**: Track correct/total guesses during a play session
- **All-time statistics**: Persistent stats across all sessions
- **AI detection metrics**: Separate accuracy rates for detecting AI vs human voices
- **Authentication required**: Users must sign in to play

## Setup Instructions

### 1. Run Database Migration

Apply the migration to create the `single_player_stats` table:

```bash
# Using Supabase CLI
supabase db push

# Or apply directly via Supabase Dashboard
# Copy the contents of supabase/migrations/0004_single_player.sql
# and run in the SQL editor
```

### 2. Verify Environment Variables

Ensure these are set in your `.env.local`:

```bash
ELEVENLAB_API_KEY=your_elevenlabs_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Access Single Player Mode

1. Sign in or create an account at `http://localhost:3000`
2. On the homepage, you'll see "Don't have any friends? Play solo here" link below the CREATE ROOM / JOIN ROOM buttons (only visible when authenticated)
3. Click to start playing at `/solo`

## User Flow

```
Homepage (authenticated) 
  → Click "Play solo here" link
  → /solo (Game Page)
    → Listen to audio
    → Swipe left (human) or right (AI)
    → Repeat for multiple rounds
    → Click "Quit & View Stats"
  → /solo/stats (Statistics Page)
    → View session results
    → View all-time statistics
    → Play again or return home
```

## File Structure

### API Routes
- **`/app/api/singleplayer/get-round/route.ts`**: Generates random game rounds
  - 50% chance: AI-generated audio (via ElevenLabs)
  - 50% chance: Browser speech synthesis (simulating human)
  
- **`/app/api/singleplayer/submit-guess/route.ts`**: Records player guesses
  - Validates authentication
  - Saves to database
  - Returns correctness feedback

- **`/app/api/singleplayer/stats/route.ts`**: Fetches player statistics
  - Total rounds and accuracy
  - AI detection rate
  - Human detection rate

### Frontend Pages
- **`/app/solo/page.tsx`**: Main game page
  - Loads audio rounds
  - Handles swipe interactions
  - Tracks session score
  
- **`/app/solo/stats/page.tsx`**: Statistics page
  - Displays session stats
  - Shows all-time performance
  - Provides navigation options

### Components
- **`/components/singleplayer/SwipeCard.tsx`**: Interactive card component
  - Audio playback controls
  - Swipe gesture handling (touch and mouse)
  - Keyboard controls
  - Visual feedback

### Data
- **`/public/librispeech-manifest.json`**: Sample text corpus
  - 20 pre-written sample texts
  - Used for generating audio rounds

### Database
- **`/supabase/migrations/0004_single_player.sql`**: Database schema
  - `single_player_stats` table
  - Tracks all game attempts with accuracy

## Game Mechanics

### Audio Generation
- **AI Rounds**: Text is sent to ElevenLabs TTS API to generate synthetic voice
- **Human Rounds**: Text is read using browser's Web Speech API (speech synthesis)
- Each round randomly selects one of 20 sample texts from the manifest

### Scoring System
- Each guess is recorded immediately
- Correct guesses increment the score
- Statistics are calculated on-the-fly:
  - Overall accuracy: correct / total
  - AI detection rate: correct AI guesses / total AI rounds
  - Human detection rate: correct human guesses / total human rounds

### Controls
- **Desktop**:
  - Arrow Left (←): Guess human
  - Arrow Right (→): Guess AI
  - Space/Enter: Play/pause audio
  - Click and drag: Swipe gesture
  
- **Mobile**:
  - Swipe left: Guess human
  - Swipe right: Guess AI
  - Tap play button: Play/pause audio

## Technical Implementation

### Authentication Flow
1. User authenticates via existing Supabase Auth
2. Access token is passed in Authorization header for API requests
3. Server validates token before processing requests

### State Management
- **Session state**: Stored in React component state (resets on page reload)
- **Persistent state**: Stored in Supabase database (all-time stats)

### Audio Handling
- **AI audio**: Generated server-side, returned as base64 data URL
- **Human audio**: Generated client-side using Web Speech API
- Audio playback managed by HTML5 audio element and SpeechSynthesis API

## API Reference

### GET /api/singleplayer/get-round

**Response:**
```json
{
  "roundId": "round_timestamp_hash",
  "audioUrl": "data:audio/mpeg;base64,..." | null,
  "text": "sample text" | undefined,
  "isAi": true | false,
  "transcriptLength": 123,
  "sampleId": "sample_001"
}
```

### POST /api/singleplayer/submit-guess

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "roundId": "round_timestamp_hash",
  "guessedAi": true | false,
  "actualIsAi": true | false,
  "audioFile": "sample_001"
}
```

**Response:**
```json
{
  "correct": true | false
}
```

### GET /api/singleplayer/stats

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "totalRounds": 42,
  "correctGuesses": 35,
  "accuracy": 83,
  "aiDetectionRate": 85,
  "humanDetectionRate": 81,
  "aiRoundsPlayed": 20,
  "humanRoundsPlayed": 22
}
```

## Database Schema

```sql
CREATE TABLE single_player_stats (
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
```

## Troubleshooting

### Audio doesn't play
- Check that ElevenLabs API key is valid
- Ensure browser supports Web Speech API
- Check browser console for errors

### "Unauthorized" errors
- Verify user is signed in
- Check that Supabase service role key is set
- Ensure session token is valid

### Stats not updating
- Check database connection
- Verify migration was applied
- Check browser network tab for API errors

### TypeScript errors
- Run `npm run typecheck` to verify
- Ensure all dependencies are installed
- Check that tsconfig paths are correct

## Future Enhancements

Potential improvements for the single player mode:

1. **Real LibriSpeech audio**: Upload actual human voice recordings
2. **Difficulty levels**: Easy (more obvious) to Hard (very similar)
3. **Leaderboard**: Compare scores with other players
4. **Daily challenges**: Special rounds with bonuses
5. **Voice customization**: Let users choose different AI voices
6. **Hints system**: Provide subtle clues for difficult rounds
7. **Achievement system**: Unlock badges for milestones
8. **Practice mode**: No stats tracking, just practice

## Support

For issues or questions about the single player mode:
1. Check this documentation
2. Review the implementation in the codebase
3. Check Supabase logs for backend issues
4. Review browser console for frontend issues

