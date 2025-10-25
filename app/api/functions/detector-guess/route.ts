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

    // Get room and verify user is the detector
    const { data: room, error: rerr } = await serviceClient
      .from('rooms')
      .select('detector_uid, ai_activated_at')
      .eq('id', roomId)
      .single()

    if (rerr || !room) {
      return NextResponse.json({ error: 'room not found' }, { status: 404 })
    }

    if (room.detector_uid !== user.id) {
      return NextResponse.json({ error: 'only detector can guess' }, { status: 403 })
    }

    // Check if guess already used
    const { data: det, error: derr } = await serviceClient
      .from('participants')
      .select('guess_used')
      .eq('room_id', roomId)
      .eq('uid', user.id)
      .single()

    if (derr || !det) {
      return NextResponse.json({ error: 'participant not found' }, { status: 404 })
    }

    if (det.guess_used) {
      return NextResponse.json({ error: 'guess already used' }, { status: 409 })
    }

    // Check if AI is currently active
    const correct = !!room.ai_activated_at
    const result = correct ? 'detector_win' : 'target_win'

    // Update participant with guess
    const { error: u1 } = await serviceClient
      .from('participants')
      .update({
        guess_used: true,
        guess_at: new Date().toISOString(),
        guess_correct: correct,
      })
      .eq('room_id', roomId)
      .eq('uid', user.id)

    if (u1) {
      return NextResponse.json({ error: u1.message }, { status: 400 })
    }

    // Update room status to ended
    const { error: u2 } = await serviceClient
      .from('rooms')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        result,
      })
      .eq('id', roomId)

    if (u2) {
      return NextResponse.json({ error: u2.message }, { status: 400 })
    }

    // Insert event record
    const { error: e1 } = await serviceClient
      .from('events')
      .insert({
        room_id: roomId,
        type: 'guess',
        uid: user.id,
        correct,
      })

    if (e1) {
      return NextResponse.json({ error: e1.message }, { status: 400 })
    }

    return NextResponse.json({ correct })
  } catch (error: any) {
    console.error('Detector guess error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to process guess' }, { status: 500 })
  }
}

