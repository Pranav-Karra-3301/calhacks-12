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

    // Get participants
    const { data: parts, error: perr } = await serviceClient
      .from('participants')
      .select('uid')
      .eq('room_id', roomId)

    if (perr) {
      return NextResponse.json({ error: perr.message }, { status: 400 })
    }

    if (!parts || parts.length !== 2) {
      return NextResponse.json({ error: 'need exactly 2 players' }, { status: 409 })
    }

    // Get room info
    const { data: room, error: rerr } = await serviceClient
      .from('rooms')
      .select('created_by')
      .eq('id', roomId)
      .single()

    if (rerr || !room) {
      return NextResponse.json({ error: 'room not found' }, { status: 404 })
    }

    // Assign roles: host becomes target, other becomes detector
    const hostUid = room.created_by
    const hostInRoom = parts.find((p) => p.uid === hostUid)
    const targetUid = hostInRoom ? hostUid : parts[0].uid
    const detectorUid = parts.find((p) => p.uid !== targetUid)?.uid

    if (!detectorUid) {
      return NextResponse.json({ error: 'unable to assign roles' }, { status: 409 })
    }

    // Update room status
    const { error: u1 } = await serviceClient
      .from('rooms')
      .update({
        status: 'talk',
        target_uid: targetUid,
        detector_uid: detectorUid,
        started_at: new Date().toISOString(),
      })
      .eq('id', roomId)

    if (u1) {
      return NextResponse.json({ error: u1.message }, { status: 400 })
    }

    // Update target role
    const { error: u2 } = await serviceClient
      .from('participants')
      .update({ role: 'target' })
      .eq('room_id', roomId)
      .eq('uid', targetUid)

    if (u2) {
      return NextResponse.json({ error: u2.message }, { status: 400 })
    }

    // Update detector role
    const { error: u3 } = await serviceClient
      .from('participants')
      .update({ role: 'detector' })
      .eq('room_id', roomId)
      .eq('uid', detectorUid)

    if (u3) {
      return NextResponse.json({ error: u3.message }, { status: 400 })
    }

    return NextResponse.json({ targetUid, detectorUid })
  } catch (error: any) {
    console.error('Assign roles error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to assign roles' }, { status: 500 })
  }
}

