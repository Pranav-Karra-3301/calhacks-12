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

    // Get room and verify user is the target
    const { data: room, error: rerr } = await serviceClient
      .from('rooms')
      .select('target_uid')
      .eq('id', roomId)
      .single()

    if (rerr || !room) {
      return NextResponse.json({ error: 'room not found' }, { status: 404 })
    }

    if (room.target_uid !== user.id) {
      return NextResponse.json({ error: 'only target can activate' }, { status: 403 })
    }

    // Update room with AI activation timestamp
    const { error: uerr } = await serviceClient
      .from('rooms')
      .update({ ai_activated_at: new Date().toISOString() })
      .eq('id', roomId)

    if (uerr) {
      return NextResponse.json({ error: uerr.message }, { status: 400 })
    }

    // Insert event record
    const { error: eerr } = await serviceClient
      .from('events')
      .insert({
        room_id: roomId,
        type: 'ai-activated',
        uid: user.id,
      })

    if (eerr) {
      return NextResponse.json({ error: eerr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Activate AI error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to activate AI' }, { status: 500 })
  }
}

