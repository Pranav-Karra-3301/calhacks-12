import { NextResponse } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { roomId } = await request.json()
    if (!roomId) {
      return NextResponse.json({ error: 'roomId is required' }, { status: 400 })
    }

    // Get auth token from header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create Supabase client with the user's token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    )

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is a participant in the room
    const { data: participant, error: participantError } = await supabase
      .from('participants')
      .select('uid, display_name')
      .eq('room_id', roomId)
      .eq('uid', user.id)
      .maybeSingle()

    if (participantError || !participant) {
      return NextResponse.json({ error: 'Not a participant in this room' }, { status: 403 })
    }

    // Generate LiveKit token
    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: 'LiveKit credentials not configured' }, { status: 500 })
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: participant.display_name || user.id.slice(0, 8),
    })

    at.addGrant({
      room: roomId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })

    const token = await at.toJwt()

    return NextResponse.json({
      token,
      url: process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL,
    })
  } catch (error: any) {
    console.error('LiveKit token error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to generate token' }, { status: 500 })
  }
}

