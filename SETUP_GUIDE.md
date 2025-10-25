# Setup Guide

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # Required for API routes

# LiveKit
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud

# ElevenLabs
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# Groq
GROQ_API_KEY=your_groq_api_key
```

## Getting Your Keys

### Supabase Service Role Key
1. Go to your Supabase Dashboard
2. Navigate to **Settings → API**
3. Under "Project API keys", find **service_role** (secret)
4. Copy this key to `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`

⚠️ **Important**: Never commit this key to version control. It bypasses Row Level Security (RLS).

### LiveKit Credentials
1. Go to [LiveKit Cloud](https://livekit.io)
2. Create a project (free tier available)
3. Get your API Key, API Secret, and WebSocket URL
4. Add them to `.env.local`

### ElevenLabs API Key
1. Go to [ElevenLabs](https://elevenlabs.io)
2. Sign up and navigate to your profile
3. Generate an API key
4. Add to `.env.local`

### Groq API Key
1. Go to [Groq Console](https://console.groq.com)
2. Sign up and create an API key
3. Add to `.env.local`

## Testing the Flow

1. **Start the dev server**:
   ```bash
   npm run dev
   ```

2. **Create a room**:
   - Click "CREATE ROOM" on the home page
   - You should see a lobby with a shareable code

3. **Join from another browser**:
   - Open the app in incognito/another browser
   - Click "JOIN ROOM" and enter the code
   - Both users should auto-redirect to the talk page

4. **Test voice chat**:
   - Grant microphone permissions
   - Both participants should hear each other

5. **Test game buttons**:
   - **Host**: Click "Let AI take over" - your mic mutes, AI starts speaking
   - **Guest (Detector)**: Click "I think its the AI speaking" - game ends with result

## Troubleshooting

### "Failed to send a request to the Edge Function"
- Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
- Restart your dev server after adding the key

### "Failed to get LiveKit token"
- Verify your LiveKit credentials are correct
- Check that `NEXT_PUBLIC_LIVEKIT_URL` starts with `wss://`

### "No audio"
- Grant microphone permissions in your browser
- Check that both users are in the same room
- Open browser console for error messages

### "AI not speaking"
- Verify `ELEVENLABS_API_KEY` and `GROQ_API_KEY` are set
- Check browser console for API errors
- Ensure you're the host (target) when clicking "Let AI take over"

