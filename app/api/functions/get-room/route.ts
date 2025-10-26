import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { roomId } = await request.json()
    
    if (!roomId) {
      return NextResponse.json({ error: 'roomId required' }, { status: 400 })
    }

    // Get auth token from header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create regular client to verify user
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    )

    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create service role client for admin operations
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch room details
    const { data: room, error: roomErr } = await serviceClient
      .from('rooms')
      .select('id, code, created_by, status, topic, target_uid, detector_uid, ai_activated_at, started_at, result')
      .eq('id', roomId)
      .maybeSingle()

    if (roomErr) {
      return NextResponse.json({ error: roomErr.message }, { status: 400 })
    }

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    // Fetch all participants in the room
    const { data: participants, error: partErr } = await serviceClient
      .from('participants')
      .select('uid, display_name, joined_at, role')
      .eq('room_id', roomId)

    if (partErr) {
      return NextResponse.json({ error: partErr.message }, { status: 400 })
    }

    return NextResponse.json({
      room,
      participants: participants || [],
    })
  } catch (error: any) {
    console.error('Get room error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to get room data' }, { status: 500 })
  }
}
