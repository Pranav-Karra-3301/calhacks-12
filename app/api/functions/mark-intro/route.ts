import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { roomId } = await request.json()
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
        global: { headers: { Authorization: authHeader } },
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

    const { data: room, error: roomErr } = await serviceClient
      .from('rooms')
      .select('created_by, intro_played_at')
      .eq('id', roomId)
      .maybeSingle()

    if (roomErr) {
      return NextResponse.json({ error: roomErr.message }, { status: 400 })
    }

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    if (room.created_by !== user.id) {
      return NextResponse.json({ error: 'Only the host can mark intro complete' }, { status: 403 })
    }

    if (room.intro_played_at) {
      return NextResponse.json({ ok: true, alreadyCompleted: true })
    }

    const { error: updateErr } = await serviceClient
      .from('rooms')
      .update({ intro_played_at: new Date().toISOString() })
      .eq('id', roomId)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Mark intro error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to mark intro' }, { status: 500 })
  }
}

