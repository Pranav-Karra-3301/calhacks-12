import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: 'Missing GROQ_API_KEY' }, { status: 500 })
  }

  try {
    const { roomId, recentTranscripts = [] } = await request.json()

    if (!roomId) {
      return NextResponse.json({ error: 'roomId is required' }, { status: 400 })
    }

    // Get auth token from header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    )

    // Verify user and get room info
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get room details and check user is the target
    const { data: room } = await supabase
      .from('rooms')
      .select('target_uid, topic')
      .eq('id', roomId)
      .maybeSingle()

    if (!room || room.target_uid !== user.id) {
      return NextResponse.json({ error: 'Only the target can use AI persona' }, { status: 403 })
    }

    // Build conversation context
    const transcriptText = Array.isArray(recentTranscripts) && recentTranscripts.length > 0
      ? recentTranscripts.join('\n')
      : 'No conversation yet.'

    const topic = room.topic || 'general conversation'

    // Generate AI response using Groq
    const completion = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.8,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: `You are having a natural conversation with a friend about "${topic}". Keep responses conversational, authentic, and brief (1-3 sentences). Match the tone of the conversation. Avoid sounding robotic or overly formal. You're trying to blend in as a human.`,
          },
          {
            role: 'user',
            content: `Recent conversation:\n${transcriptText}\n\nContinue the conversation naturally. What would you say next?`,
          },
        ],
      }),
    })

    if (!completion.ok) {
      const errorText = await completion.text()
      return NextResponse.json({ error: 'AI generation failed', detail: errorText }, { status: 502 })
    }

    const data = await completion.json()
    const response = data?.choices?.[0]?.message?.content?.trim() || ''

    if (!response) {
      return NextResponse.json({ error: 'No response generated' }, { status: 500 })
    }

    // Get the user's cloned voice ID
    const { data: clone } = await supabase
      .from('clones')
      .select('voice_id, status')
      .eq('room_id', roomId)
      .eq('uid', user.id)
      .maybeSingle()

    const voiceId = clone?.voice_id || 'kdmDKE6EkgrWrrykO9Qt' // Fallback to moderator voice

    return NextResponse.json({
      text: response,
      voiceId,
    })
  } catch (error: any) {
    console.error('AI persona error:', error)
    return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 })
  }
}

