import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
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

    // Fetch all stats for the user
    const { data: stats, error: statsError } = await supabase
      .from('single_player_stats')
      .select('*')
      .eq('uid', user.id)
      .order('created_at', { ascending: false })

    if (statsError) {
      console.error('Error fetching stats:', statsError)
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
    }

    const totalRounds = stats?.length || 0
    const correctGuesses = stats?.filter(s => s.correct).length || 0
    const accuracy = totalRounds > 0 ? Math.round((correctGuesses / totalRounds) * 100) : 0

    // Calculate AI detection rate (when it was AI, how often did they guess correctly)
    const aiRounds = stats?.filter(s => s.is_ai) || []
    const correctAiGuesses = aiRounds.filter(s => s.correct).length
    const aiDetectionRate = aiRounds.length > 0 ? Math.round((correctAiGuesses / aiRounds.length) * 100) : 0

    // Calculate human detection rate (when it was human, how often did they guess correctly)
    const humanRounds = stats?.filter(s => !s.is_ai) || []
    const correctHumanGuesses = humanRounds.filter(s => s.correct).length
    const humanDetectionRate = humanRounds.length > 0 ? Math.round((correctHumanGuesses / humanRounds.length) * 100) : 0

    return NextResponse.json({
      totalRounds,
      correctGuesses,
      accuracy,
      aiDetectionRate,
      humanDetectionRate,
      aiRoundsPlayed: aiRounds.length,
      humanRoundsPlayed: humanRounds.length,
    })
  } catch (e: any) {
    console.error('Error in stats:', e)
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

