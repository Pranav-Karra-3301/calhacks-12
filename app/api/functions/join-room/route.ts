import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { roomId, displayName } = await request.json()
    
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

    // Ensure room exists
    const { data: room, error: rerr } = await serviceClient
      .from('rooms')
      .select('id')
      .eq('id', roomId)
      .single()

    if (rerr || !room) {
      return NextResponse.json({ error: 'room not found' }, { status: 404 })
    }

    // Check participant count
    const { count, error: cntErr } = await serviceClient
      .from('participants')
      .select('*', { head: true, count: 'exact' })
      .eq('room_id', roomId)

    if (cntErr) {
      return NextResponse.json({ error: cntErr.message }, { status: 400 })
    }

    if ((count ?? 0) >= 2) {
      // Allow re-join if user is already in the room
      const { data: existing } = await serviceClient
        .from('participants')
        .select('uid')
        .eq('room_id', roomId)
        .eq('uid', user.id)
        .maybeSingle()

      if (!existing) {
        return NextResponse.json({ error: 'room is full' }, { status: 409 })
      }
    }

    // Query profiles table for display_name
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle()

    // Generate a fallback display name with priority: profiles.display_name → provided → user_metadata → email → Player
    let finalDisplayName = profile?.display_name || displayName || user.user_metadata?.name
    if (!finalDisplayName) {
      // Try to use email username
      if (user.email) {
        finalDisplayName = user.email.split('@')[0]
      } else {
        // Last resort: Player + short UID
        finalDisplayName = `Player ${user.id.slice(0, 6)}`
      }
    }

    // Upsert participant
    const { error: partErr } = await serviceClient.from('participants').upsert({
      room_id: roomId,
      uid: user.id,
      display_name: finalDisplayName,
      role: null,
      is_ready: false,
      guess_used: false,
    })

    if (partErr) {
      return NextResponse.json({ error: partErr.message }, { status: 400 })
    }

    return NextResponse.json({ roomId })
  } catch (error: any) {
    console.error('Join room error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to join room' }, { status: 500 })
  }
}

