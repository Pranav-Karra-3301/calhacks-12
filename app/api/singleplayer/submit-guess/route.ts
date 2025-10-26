import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { roundId, guessedAi, actualIsAi, audioFile } = await request.json()
    
    if (typeof guessedAi !== 'boolean' || typeof actualIsAi !== 'boolean' || !audioFile) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
    }

    // Get user from authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    
    // Create Supabase client with service role to verify token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const correct = guessedAi === actualIsAi

    // Insert record into single_player_stats
    const { error: insertError } = await supabase
      .from('single_player_stats')
      .insert({
        uid: user.id,
        is_ai: actualIsAi,
        guessed_ai: guessedAi,
        correct,
        audio_file: audioFile,
      })

    if (insertError) {
      console.error('Error inserting stats:', insertError)
      return NextResponse.json({ error: 'Failed to save stats' }, { status: 500 })
    }

    return NextResponse.json({ correct })
  } catch (e: any) {
    console.error('Error in submit-guess:', e)
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

