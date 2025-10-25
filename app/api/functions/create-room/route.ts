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

    // Create room
    const { error: roomErr } = await serviceClient.from('rooms').insert({
      id: roomId,
      code: roomId,
      created_by: user.id,
      status: 'lobby',
    })

    // Ignore duplicate inserts (23505 is unique violation)
    if (roomErr && roomErr.code !== '23505') {
      return NextResponse.json({ error: roomErr.message }, { status: 400 })
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
    console.error('Create room error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to create room' }, { status: 500 })
  }
}

