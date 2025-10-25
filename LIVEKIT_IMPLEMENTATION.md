# LiveKit Voice Chat Implementation

## Overview
Successfully integrated LiveKit for real-time voice communication between two players with moderator voice, AI persona takeover, and game detection mechanics.

## What Was Implemented

### 1. Dependencies Added
- `livekit-client` (v2.5.8) - Browser SDK for LiveKit
- `livekit-server-sdk` (v2.6.1) - Server SDK for token generation
- `@livekit/components-react` (v2.6.4) - React helpers

### 2. New Files Created

#### `/app/api/livekit/token/route.ts`
- Generates LiveKit access tokens for authenticated users
- Validates user is a participant in the room
- Returns token and LiveKit URL for connection

#### `/lib/livekit-audio.ts`
- Helper functions for audio publishing to LiveKit
- `publishAudioBlob()` - Publishes audio blobs (moderator, AI) to room
- `setLocalAudioEnabled()` - Mutes/unmutes local microphone
- `replaceLocalAudioTrack()` - Replaces audio track for AI takeover

#### `/app/api/ai-persona/route.ts`
- Generates contextual AI responses using Groq
- Returns AI response text and cloned voice ID
- Used during AI persona takeover

### 3. Major Rewrite

#### `/app/r/[roomId]/talk/page.tsx`
Complete rebuild with LiveKit integration including:

**LiveKit Room Connection:**
- Connects to LiveKit room using generated token
- Handles participant join/leave events
- Subscribes to remote audio tracks automatically
- Tracks speaking indicators

**Moderator Voice:**
- Plays intro when room loads explaining game rules
- Moderator audio is published to LiveKit room (both participants hear it)
- Q&A system where moderator answers questions via Groq + ElevenLabs
- Uses voice ID: `kdmDKE6EkgrWrrykO9Qt`

**Real-time Transcription:**
- Uses existing ChunkedRecorder to capture local audio
- Sends chunks to Groq Whisper for transcription
- Inserts transcripts into database
- Displays in real-time via Supabase realtime subscriptions
- Automatically stops during AI takeover

**Topic Suggestions:**
- Fetches conversation topics from Groq every 10 seconds
- Based on recent transcript context
- Displays as pill-style tags

**AI Persona Takeover (Host Only):**
- When activated, mutes host's microphone
- Generates AI responses every ~10 seconds using Groq
- Converts to speech using host's cloned ElevenLabs voice
- Publishes AI audio to LiveKit room (other player hears it)
- Shows countdown timer (max 3 minutes)
- Inserts AI responses into transcript
- Automatically stops after 3 minutes or when detected

**Detector Guess:**
- One-time button for detector to call out AI
- Checks if AI is currently active
- Plays moderator announcement with result
- Ends game immediately

**Game End Logic:**
- AI timer reaches 3 minutes → Moderator announces detector failed
- Detector guesses correctly → Moderator announces detector won
- Detector guesses incorrectly → Moderator announces detector lost
- Displays final result

**UI Components:**
- Two participant cards showing Speaker A/B with real-time speaking indicators
- Audio waveform visualization (animated bars)
- Transcript panel with real-time updates
- Moderator panel with Q&A
- Topic suggestions panel
- Controls panel (AI activation, detector guess, leave call)
- Timer showing elapsed time
- AI persona progress bar

## How It Works

### Room Flow
1. **Create Room** → Host gets shareable code
2. **Join Room** → Guest enters code and joins lobby
3. **Auto-start** → When 2 players join, roles are assigned automatically
4. **Talk Page** → Both players connect to LiveKit room and voice chat begins
5. **Moderator Intro** → Both hear introduction and game rules
6. **Conversation** → Players talk naturally, transcript appears in real-time
7. **AI Takeover** → Host can activate AI persona (mutes their mic, AI speaks as them)
8. **Detection** → Detector has one guess to call out the AI
9. **Game End** → Result announced, players can leave

### Audio Routing
- **Player Audio:** Captured locally → Sent to LiveKit → Other player hears it
- **Moderator Audio:** Generated via ElevenLabs → Published to LiveKit → Both players hear it
- **AI Persona Audio:** Generated via Groq + ElevenLabs → Published to LiveKit as host's audio → Detector hears it
- **Transcription:** Local audio → Groq Whisper → Database → UI updates via realtime

### Environment Variables Required
```
# LiveKit
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud

# ElevenLabs
ELEVENLABS_API_KEY=your_key

# Groq
GROQ_API_KEY=your_key

# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
```

## Testing Checklist
- [x] Build succeeds
- [x] TypeScript compiles without errors
- [ ] Create new room and get shareable code
- [ ] Join room from another browser/device
- [ ] Verify both participants connect to LiveKit room
- [ ] Verify both hear moderator intro
- [ ] Test voice chat between both participants
- [ ] Test transcript appears for both participants
- [ ] Test moderator Q&A (both hear answer)
- [ ] Test topic suggestions refresh
- [ ] Test AI persona activation (host's mic mutes, AI speaks)
- [ ] Verify detector hears AI voice
- [ ] Test detector guess (correct and incorrect)
- [ ] Verify AI timer and 3-minute auto-stop
- [ ] Verify game end announcements

## Notes
- LiveKit room name = database room ID
- Participant identity = Supabase user ID
- Moderator uses separate audio tracks published temporarily
- AI persona seamlessly takes over host's audio track
- Transcription continues during AI takeover
- All audio is routed through LiveKit for synchronization

