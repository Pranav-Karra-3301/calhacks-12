# Single Player Mode - Quick Setup Checklist

## ✅ Completed Implementation
All code has been implemented and committed to the `single-player-mode` branch.

## 🚀 Next Steps to Deploy

### 1. Apply Database Migration
Run this command to create the `single_player_stats` table:

```bash
# Option A: Using Supabase CLI (recommended)
supabase db push

# Option B: Via Supabase Dashboard
# 1. Go to your Supabase project dashboard
# 2. Navigate to SQL Editor
# 3. Copy contents from: supabase/migrations/0004_single_player.sql
# 4. Execute the SQL
```

### 2. Verify Environment Variables
Check that your `.env.local` has:
```bash
ELEVENLAB_API_KEY=your_key_here
NEXT_PUBLIC_SUPABASE_URL=your_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
SUPABASE_SERVICE_ROLE_KEY=your_key_here
```

### 3. Test the Feature

```bash
# Start the dev server
npm run dev

# Then follow these steps:
# 1. Navigate to http://localhost:3000
# 2. Sign in or create an account
# 3. Look for "Don't have any friends? Play solo here" link
# 4. Click it to start playing
# 5. Swipe left (human) or right (AI)
# 6. Click "Quit & View Stats" to see results
```

## 📱 Testing Checklist

- [ ] Homepage shows solo link for authenticated users
- [ ] Homepage hides solo link for unauthenticated users
- [ ] Can navigate to `/solo` page
- [ ] Audio plays when clicking play button
- [ ] Can swipe left and right on the card
- [ ] Arrow keys work on desktop (← for human, → for AI)
- [ ] Session score updates after each guess
- [ ] Can quit and navigate to stats page
- [ ] Stats page shows session results
- [ ] Stats page shows all-time statistics
- [ ] Can play again from stats page
- [ ] Can return home from stats page

## 🎮 How to Play

**Desktop:**
- Click play button to hear audio
- Press ← (left arrow) if you think it's HUMAN
- Press → (right arrow) if you think it's AI
- Or click and drag left/right to swipe

**Mobile:**
- Tap play button to hear audio
- Swipe left if you think it's HUMAN
- Swipe right if you think it's AI

## 📊 Statistics Tracked

- **Session Stats**: Correct/Total for current play session
- **All-Time Stats**: Total rounds, overall accuracy
- **AI Detection Rate**: Accuracy when audio is AI
- **Human Detection Rate**: Accuracy when audio is human

## 🔧 Troubleshooting

**Audio not playing:**
- Check ElevenLabs API key is valid
- Check browser console for errors
- Ensure browser supports Web Speech API

**Can't see the solo link:**
- Make sure you're signed in
- Check that authentication is working

**Stats not saving:**
- Verify database migration was applied
- Check Supabase project is accessible
- Verify service role key is correct

## 📚 Documentation

For detailed documentation, see: `SINGLE_PLAYER_MODE.md`

## 🎯 Files Created

### Backend (API Routes)
- `app/api/singleplayer/get-round/route.ts`
- `app/api/singleplayer/submit-guess/route.ts`
- `app/api/singleplayer/stats/route.ts`

### Frontend (Pages)
- `app/solo/page.tsx`
- `app/solo/stats/page.tsx`

### Components
- `components/singleplayer/SwipeCard.tsx`

### Database
- `supabase/migrations/0004_single_player.sql`

### Data
- `public/librispeech-manifest.json`

### Documentation
- `SINGLE_PLAYER_MODE.md`
- `SINGLE_PLAYER_SETUP.md`

### Modified Files
- `components/home/GameCard.tsx` (added solo link)
- `tsconfig.json` (added public path mapping)

## ✨ Ready to Merge

Once tested, merge this branch into main:

```bash
git checkout main
git merge single-player-mode
git push origin main
```

