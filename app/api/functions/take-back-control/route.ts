import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { roomId, sessionId } = await request.json()

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
      .select('target_uid, ai_activated_at, ai_speaking_duration_ms, ai_takeback_count')
      .eq('id', roomId)
      .single()

    if (rerr || !room) {
      return NextResponse.json({ error: 'room not found' }, { status: 404 })
    }

    if (room.target_uid !== user.id) {
      return NextResponse.json({ error: 'only target can take back control' }, { status: 403 })
    }

    if (!room.ai_activated_at) {
      return NextResponse.json({ error: 'AI not currently active' }, { status: 400 })
    }

    // Calculate how long AI has been speaking
    const aiDurationMs = Date.now() - new Date(room.ai_activated_at).getTime()
    const totalDuration = (room.ai_speaking_duration_ms || 0) + aiDurationMs

    // Update room to deactivate AI and track statistics
    const { error: uerr } = await serviceClient
      .from('rooms')
      .update({
        ai_deactivated_at: new Date().toISOString(),
        ai_deactivation_reason: 'manual_takeback',
        ai_speaking_duration_ms: totalDuration,
        ai_takeback_count: (room.ai_takeback_count || 0) + 1,
        // Don't clear ai_activated_at - we'll use it to track if AI can be reactivated
      })
      .eq('id', roomId)

    if (uerr) {
      return NextResponse.json({ error: uerr.message }, { status: 400 })
    }

    // End the current AI session if provided
    if (sessionId) {
      const { error: sessionErr } = await serviceClient
        .from('ai_sessions')
        .update({
          ended_at: new Date().toISOString(),
          duration_ms: aiDurationMs,
        })
        .eq('id', sessionId)
        .eq('room_id', roomId)

      if (sessionErr) {
        console.error('Failed to update AI session:', sessionErr)
      }
    }

    // Record the control switch event
    const { error: eerr } = await serviceClient
      .from('ai_control_switches')
      .insert({
        room_id: roomId,
        uid: user.id,
        switch_type: 'manual_takeback',
        ai_duration_before_switch_ms: aiDurationMs,
      })

    if (eerr) {
      console.error('Failed to record control switch:', eerr)
    }

    // Insert event record
    await serviceClient
      .from('events')
      .insert({
        room_id: roomId,
        type: 'ai-takeback',
        uid: user.id,
        metadata: {
          duration_ms: aiDurationMs,
          total_duration_ms: totalDuration,
          takeback_count: (room.ai_takeback_count || 0) + 1,
        }
      })

    return NextResponse.json({
      ok: true,
      aiDurationMs,
      totalDurationMs: totalDuration,
      takebackCount: (room.ai_takeback_count || 0) + 1,
    })
  } catch (error: any) {
    console.error('Take back control error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to take back control' }, { status: 500 })
  }
}