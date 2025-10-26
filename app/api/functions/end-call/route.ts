import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { roomId, reason, leaverUid } = await request.json()

    if (!roomId) {
      return NextResponse.json({ error: 'roomId required' }, { status: 400 })
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: participants, error: partErr } = await serviceClient
      .from('participants')
      .select('uid, role')
      .eq('room_id', roomId)

    if (partErr) {
      return NextResponse.json({ error: partErr.message }, { status: 400 })
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({ error: 'room not found' }, { status: 404 })
    }

    const isParticipant = participants.some((p) => p.uid === user.id)
    if (!isParticipant) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
    }

    const actorUid = (typeof leaverUid === 'string' && leaverUid.length > 0) ? leaverUid : user.id
    const actor = participants.find((p) => p.uid === actorUid)

    if (!actor) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    const { data: room, error: roomErr } = await serviceClient
      .from('rooms')
      .select('status, result')
      .eq('id', roomId)
      .maybeSingle()

    if (roomErr) {
      return NextResponse.json({ error: roomErr.message }, { status: 400 })
    }

    if (!room) {
      return NextResponse.json({ error: 'room not found' }, { status: 404 })
    }

    if (room.status === 'ended') {
      return NextResponse.json({ ok: true, result: room.result })
    }

    const result =
      actor.role === 'target'
        ? 'detector_win'
        : actor.role === 'detector'
        ? 'target_win'
        : null

    const { error: updateErr } = await serviceClient
      .from('rooms')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        result,
      })
      .eq('id', roomId)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, result, reason: reason ?? null })
  } catch (error: any) {
    console.error('End call error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to end room' }, { status: 500 })
  }
}
